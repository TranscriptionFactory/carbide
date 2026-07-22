import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { VaultStore } from "$lib/features/vault";
import type { AiPort, AiStreamPort } from "$lib/features/ai/ports";
import type { SearchPort } from "$lib/features/search";
import type {
  AiCliProbe,
  AiDialogContext,
  AiExecutionResult,
  AiMode,
  AiProviderConfig,
  AiVaultContext,
  AiVaultContextNote,
  VaultContextSettings,
} from "$lib/features/ai/domain/ai_types";
import { provider_command } from "$lib/features/ai/domain/ai_types";
import {
  build_ai_document_prompt,
  build_ai_prompt,
} from "$lib/features/ai/domain/ai_prompt_builder";
import { as_note_path } from "$lib/shared/types/ids";
import type {
  AiStreamChunk,
  AiImagePart,
} from "$lib/features/ai/domain/ai_stream_types";
import { MarkdownJoiner } from "$lib/features/ai/domain/markdown_joiner";
import { humanize_ai_error } from "$lib/features/ai/domain/ai_error_messages";

const log = create_logger("ai_service");

type AiExecuteInput = {
  provider_config: AiProviderConfig;
  prompt: string;
  context: AiDialogContext;
  mode: AiMode;
  timeout_seconds?: number | null;
  vault_context_settings?: VaultContextSettings;
};

function to_vault_context_note(n: {
  path: string;
  title: string;
  blurb: string;
}): AiVaultContextNote {
  return { path: n.path, title: n.title, blurb: n.blurb };
}

export class AiService {
  constructor(
    private readonly ai_port: AiPort,
    private readonly vault_store: VaultStore,
    private readonly ai_stream_port?: AiStreamPort,
    private readonly search_port?: SearchPort,
  ) {}

  async check_availability(config: AiProviderConfig): Promise<boolean> {
    return (await this.detect(config)).status === "present";
  }

  async detect(config: AiProviderConfig): Promise<AiCliProbe> {
    const command = provider_command(config);
    if (!command) {
      return {
        status: "present",
        resolved_path: null,
        version: null,
        error: null,
      };
    }
    return await this.ai_port.detect_cli({ command });
  }

  async set_api_key(provider_id: string, key: string): Promise<void> {
    await this.ai_port.set_api_key(provider_id, key);
  }

  async delete_api_key(provider_id: string): Promise<void> {
    await this.ai_port.delete_api_key(provider_id);
  }

  async get_api_key_hint(provider_id: string): Promise<string | null> {
    return await this.ai_port.get_api_key_hint(provider_id);
  }

  async test_provider(config: AiProviderConfig): Promise<string> {
    return await this.ai_port.test_provider(config);
  }

  async open_vault_in_agent(
    config: AiProviderConfig,
    vault_path: string,
  ): Promise<void> {
    await this.ai_port.open_vault_in_agent(config, vault_path);
  }

  async fetch_vault_context(
    note_path: string,
    settings: VaultContextSettings,
  ): Promise<AiVaultContext> {
    const empty: AiVaultContext = {
      similar_notes: [],
      backlinks: [],
      outlinks: [],
    };

    const vault = this.vault_store.vault;
    if (!vault || !this.search_port) return empty;

    const promises: [
      Promise<AiVaultContextNote[]>,
      Promise<{
        backlinks: AiVaultContextNote[];
        outlinks: AiVaultContextNote[];
      }>,
    ] = [
      this.search_port
        .find_similar_notes(vault.id, note_path, settings.similar_limit, true)
        .then((hits) =>
          hits
            .filter((h) => h.distance <= settings.similarity_threshold)
            .map((h) => to_vault_context_note(h.note)),
        )
        .catch((err) => {
          log.warn("Failed to fetch similar notes for AI context", {
            error: error_message(err),
          });
          return [];
        }),
      settings.include_links
        ? this.search_port
            .get_note_links_snapshot(vault.id, note_path)
            .then((snapshot) => ({
              backlinks: snapshot.backlinks.map(to_vault_context_note),
              outlinks: snapshot.outlinks.map(to_vault_context_note),
            }))
            .catch((err) => {
              log.warn("Failed to fetch note links for AI context", {
                error: error_message(err),
              });
              return { backlinks: [], outlinks: [] };
            })
        : Promise.resolve({ backlinks: [], outlinks: [] }),
    ];

    const [similar_notes, links] = await Promise.all(promises);

    return {
      similar_notes,
      backlinks: links.backlinks,
      outlinks: links.outlinks,
    };
  }

  private async build_execution_prompt(
    input: AiExecuteInput,
  ): Promise<{ prompt: string; working_path: string }> {
    const { context } = input;

    if (context.kind === "document") {
      return {
        prompt: build_ai_document_prompt({
          file_path: context.file_path,
          file_title: context.file_title,
          content: context.content,
          user_prompt: input.prompt,
          mode: input.mode,
        }),
        working_path: context.file_path,
      };
    }

    let vault_context: AiVaultContext | undefined;
    if (input.vault_context_settings?.enabled) {
      vault_context = await this.fetch_vault_context(
        context.note_path,
        input.vault_context_settings,
      );
    }
    return {
      prompt: build_ai_prompt({
        note_path: context.note_path,
        note_markdown: context.note_markdown,
        selection: context.selection,
        user_prompt: input.prompt,
        target: context.target,
        mode: input.mode,
        ...(vault_context ? { vault_context } : {}),
      }),
      working_path: context.note_path,
    };
  }

  async execute(input: AiExecuteInput): Promise<AiExecutionResult> {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) {
      throw new Error("No active vault");
    }

    const { context } = input;
    const { prompt, working_path } = await this.build_execution_prompt(input);

    const result = await this.ai_port.execute({
      provider_config: input.provider_config,
      vault_path,
      note_path: as_note_path(working_path),
      prompt,
      timeout_seconds: input.timeout_seconds ?? null,
    });

    if (!result.success) {
      log.warn("AI execution failed", {
        provider: input.provider_config.id,
        error: result.error,
      });
    }

    return {
      ...result,
      error: result.error
        ? humanize_ai_error(result.error, input.provider_config).message
        : result.success
          ? null
          : `${input.provider_config.name} failed to ${input.mode === "ask" ? "answer the question" : `edit the ${context.kind}`}`,
    };
  }

  async execute_streaming(
    input: AiExecuteInput & { signal?: AbortSignal },
    on_chunk?: (partial: string) => void,
    on_reasoning?: (partial: string) => void,
  ): Promise<AiExecutionResult> {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) {
      throw new Error("No active vault");
    }
    if (!this.ai_stream_port) {
      return {
        success: false,
        output: "",
        error: "Streaming is not available",
      };
    }

    const { prompt } = await this.build_execution_prompt(input);
    const joiner = new MarkdownJoiner();
    let output = "";
    let reasoning = "";
    let error: string | null = null;

    const push = (text: string) => {
      if (!text) return;
      output += text;
      on_chunk?.(output);
    };

    for await (const chunk of this.ai_stream_port.stream_text({
      provider_config: input.provider_config,
      system_prompt: "",
      messages: [{ role: "user", content: prompt }],
      vault_path,
      ...(input.signal ? { signal: input.signal } : {}),
    })) {
      if (chunk.type === "text") {
        push(joiner.process_chunk(chunk.text));
        continue;
      }
      if (chunk.type === "reasoning") {
        reasoning += chunk.text;
        on_reasoning?.(reasoning);
        continue;
      }
      push(joiner.flush());
      if (chunk.type === "error" && chunk.error !== "aborted") {
        error = humanize_ai_error(chunk.error, input.provider_config).message;
        log.warn("AI streaming execution failed", {
          provider: input.provider_config.id,
          error: chunk.error,
        });
      }
    }
    push(joiner.flush());

    if (error) {
      return { success: false, output, error };
    }
    return { success: true, output, error: null };
  }

  async *stream_inline(input: {
    provider_config: AiProviderConfig;
    system_prompt: string;
    user_prompt: string;
    images?: AiImagePart[];
    signal?: AbortSignal;
  }): AsyncGenerator<AiStreamChunk> {
    if (!this.ai_stream_port) {
      yield { type: "error", error: "Streaming is not available" };
      return;
    }

    const joiner = new MarkdownJoiner();

    for await (const chunk of this.ai_stream_port.stream_text({
      provider_config: input.provider_config,
      system_prompt: input.system_prompt,
      messages: [
        {
          role: "user",
          content: input.images?.length
            ? [{ type: "text", text: input.user_prompt }, ...input.images]
            : input.user_prompt,
        },
      ],
      ...(this.vault_store.vault?.path
        ? { vault_path: this.vault_store.vault.path }
        : {}),
      ...(input.signal ? { signal: input.signal } : {}),
    })) {
      if (chunk.type === "reasoning") {
        continue;
      }
      if (chunk.type === "text") {
        const text = joiner.process_chunk(chunk.text);
        if (text) yield { type: "text", text };
      } else {
        const remaining = joiner.flush();
        if (remaining) yield { type: "text", text: remaining };
        if (chunk.type === "error") {
          const friendly = humanize_ai_error(
            chunk.error,
            input.provider_config,
          );
          log.warn("AI inline stream failed", { error: friendly.detail });
          yield { type: "error", error: friendly.message };
        } else {
          yield chunk;
        }
      }
    }
  }
}
