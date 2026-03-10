import { create_logger } from "$lib/shared/utils/logger";
import type { VaultStore } from "$lib/features/vault";
import type { AiPort } from "$lib/features/ai/ports";
import {
  AI_PROVIDER_DISPLAY,
  DEFAULT_OLLAMA_MODEL,
  type AiDialogContext,
  type AiExecutionResult,
  type AiProvider,
} from "$lib/features/ai/domain/ai_types";
import { build_ai_prompt } from "$lib/features/ai/domain/ai_prompt_builder";

const log = create_logger("ai_service");

export class AiService {
  constructor(
    private readonly ai_port: AiPort,
    private readonly vault_store: VaultStore,
  ) {}

  async check_cli(
    provider: AiProvider,
    command: string | null = null,
  ): Promise<boolean> {
    return await this.ai_port.check_cli({ provider, command });
  }

  async execute(input: {
    provider: AiProvider;
    prompt: string;
    context: AiDialogContext;
    command?: string | null;
    ollama_model?: string;
    timeout_seconds?: number | null;
  }): Promise<AiExecutionResult> {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) {
      throw new Error("No active vault");
    }

    const prompt = build_ai_prompt({
      note_path: input.context.note_path,
      note_markdown: input.context.note_markdown,
      selection: input.context.selection,
      user_prompt: input.prompt,
      target: input.context.target,
    });

    const result = await this.ai_port.execute({
      provider: input.provider,
      vault_path,
      note_path: input.context.note_path,
      prompt,
      command: input.command ?? null,
      ollama_model:
        input.provider === "ollama"
          ? (input.ollama_model?.trim() ?? DEFAULT_OLLAMA_MODEL)
          : null,
      timeout_seconds: input.timeout_seconds ?? null,
    });

    if (!result.success) {
      log.warn("AI execution failed", {
        provider: input.provider,
        error: result.error,
      });
    }

    return {
      ...result,
      error:
        result.error ??
        (result.success
          ? null
          : `${AI_PROVIDER_DISPLAY[input.provider].name} failed to edit the note`),
    };
  }
}
