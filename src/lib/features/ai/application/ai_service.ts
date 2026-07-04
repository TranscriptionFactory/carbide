import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import type { VaultStore } from "$lib/features/vault";
import type { AiPort, AiStreamPort } from "$lib/features/ai/ports";
import type { SearchPort } from "$lib/features/search";
import type {
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
import type { AiStreamChunk } from "$lib/features/ai/domain/ai_stream_types";
import { MarkdownJoiner } from "$lib/features/ai/domain/markdown_joiner";

const log = create_logger("ai_service");

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
    const command = provider_command(config);
    if (!command) return true;
    return await this.ai_port.check_cli({ command });
  }

  private async fetch_vault_context(
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

  async execute(input: {
    provider_config: AiProviderConfig;
    prompt: string;
    context: AiDialogContext;
    mode: AiMode;
    timeout_seconds?: number | null;
    vault_context_settings?: VaultContextSettings;
  }): Promise<AiExecutionResult> {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) {
      throw new Error("No active vault");
    }

    const { context } = input;
    let prompt: string;
    let working_path: string;
    let subject: "note" | "document";

    if (context.kind === "document") {
      prompt = build_ai_document_prompt({
        file_path: context.file_path,
        file_title: context.file_title,
        content: context.content,
        user_prompt: input.prompt,
        mode: input.mode,
      });
      working_path = context.file_path;
      subject = "document";
    } else {
      let vault_context: AiVaultContext | undefined;
      if (input.vault_context_settings?.enabled) {
        vault_context = await this.fetch_vault_context(
          context.note_path,
          input.vault_context_settings,
        );
      }
      prompt = build_ai_prompt({
        note_path: context.note_path,
        note_markdown: context.note_markdown,
        selection: context.selection,
        user_prompt: input.prompt,
        target: context.target,
        mode: input.mode,
        ...(vault_context ? { vault_context } : {}),
      });
      working_path = context.note_path;
      subject = "note";
    }

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
      error:
        result.error ??
        (result.success
          ? null
          : `${input.provider_config.name} failed to ${input.mode === "ask" ? "answer the question" : `edit the ${subject}`}`),
    };
  }

  async *stream_inline(input: {
    provider_config: AiProviderConfig;
    system_prompt: string;
    user_prompt: string;
  }): AsyncGenerator<AiStreamChunk> {
    if (!this.ai_stream_port) {
      yield { type: "error", error: "Streaming is not available" };
      return;
    }

    const joiner = new MarkdownJoiner();

    for await (const chunk of this.ai_stream_port.stream_text({
      provider_config: input.provider_config,
      system_prompt: input.system_prompt,
      messages: [{ role: "user", content: input.user_prompt }],
    })) {
      if (chunk.type === "text") {
        const text = joiner.process_chunk(chunk.text);
        if (text) yield { type: "text", text };
      } else {
        const remaining = joiner.flush();
        if (remaining) yield { type: "text", text: remaining };
        yield chunk;
      }
    }
  }
}
