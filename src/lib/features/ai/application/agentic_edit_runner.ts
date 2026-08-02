import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import { inline_edit_policy } from "$lib/features/ai/domain/agent_run_policy";
import type {
  AiExecutionResult,
  AiProviderConfig,
} from "$lib/features/ai/domain/ai_types";
import type { RunHandle, RunStarter } from "$lib/features/assistant";
import { start_run_stream } from "$lib/features/assistant";

const log = create_logger("agentic_edit_runner");

export type AgentCheckpointGit = {
  create_checkpoint(description: string): Promise<unknown>;
};

type AgenticEditInput = {
  provider_config: AiProviderConfig;
  prompt: string;
  vault_path: string;
  on_run_started?: (handle: RunHandle) => void;
  on_text?: (partial: string) => void;
};

export class AgenticEditRunner {
  constructor(
    private readonly run_starter: RunStarter,
    private readonly git: AgentCheckpointGit,
  ) {}

  async run(input: AgenticEditInput): Promise<AiExecutionResult> {
    await this.checkpoint();

    let output = "";
    try {
      const { handle, events } = await start_run_stream(this.run_starter, {
        kind: "inline",
        label: input.prompt,
        provider: input.provider_config,
        request: {
          mode: "agent",
          prompt: input.prompt,
          toolset: inline_edit_policy().toolset,
          history: [],
          backend: "native",
        },
      });
      input.on_run_started?.(handle);

      for await (const event of events) {
        if (event.type === "text") {
          output += event.text;
          input.on_text?.(output);
        } else if (event.type === "error") {
          // The kernel humanizes once; this is already user-facing text.
          return { success: false, output, error: event.message };
        } else if (event.type === "end" && event.outcome.status === "aborted") {
          // The edit the user stopped keeps whatever it wrote, but must not
          // report success — the checkpoint above is what makes it undoable.
          return { success: false, output, error: null, aborted: true };
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
