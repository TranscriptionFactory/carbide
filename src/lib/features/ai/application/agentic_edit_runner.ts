import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import { humanize_ai_error } from "$lib/features/ai/domain/ai_error_messages";
import { inline_edit_policy } from "$lib/features/ai/domain/agent_run_policy";
import type {
  AiExecutionResult,
  AiProviderConfig,
} from "$lib/features/ai/domain/ai_types";
import type { AgentPort } from "$lib/features/rag";

const log = create_logger("agentic_edit_runner");

export type AgentCheckpointGit = {
  create_checkpoint(description: string): Promise<unknown>;
};

type AgenticEditInput = {
  provider_config: AiProviderConfig;
  prompt: string;
  vault_path: string;
  signal?: AbortSignal;
  on_text?: (partial: string) => void;
};

export class AgenticEditRunner {
  constructor(
    private readonly agent_port: AgentPort,
    private readonly git: AgentCheckpointGit,
  ) {}

  async run(input: AgenticEditInput): Promise<AiExecutionResult> {
    await this.checkpoint();

    let output = "";
    try {
      const events = this.agent_port.stream_turn({
        provider_config: input.provider_config,
        prompt: input.prompt,
        vault_path: input.vault_path,
        toolset: inline_edit_policy().toolset,
        history: [],
        backend: "native",
        ...(input.signal ? { signal: input.signal } : {}),
      });
      for await (const event of events) {
        if (input.signal?.aborted) break;
        if (event.type === "text") {
          output += event.delta;
          input.on_text?.(output);
        } else if (event.type === "error") {
          return {
            success: false,
            output,
            error: humanize_ai_error(event.message, input.provider_config)
              .message,
          };
        }
      }
      return { success: true, output, error: null };
    } catch (err) {
      return { success: false, output, error: error_message(err) };
    }
  }

  private async checkpoint(): Promise<void> {
    try {
      await this.git.create_checkpoint("before inline edit");
    } catch (err) {
      log.warn("Inline edit checkpoint failed", { error: error_message(err) });
    }
  }
}
