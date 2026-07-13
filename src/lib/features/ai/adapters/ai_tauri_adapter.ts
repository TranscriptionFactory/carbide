import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type {
  AiCliCheckRequest,
  AiCliProbe,
  AiExecutionResult,
  AiPortExecuteRequest,
} from "$lib/features/ai/domain/ai_types";
import type { AiPort } from "$lib/features/ai/ports";

export function create_ai_tauri_adapter(): AiPort {
  return {
    async check_cli(input: AiCliCheckRequest) {
      return await tauri_invoke<boolean>("ai_check_cli", {
        command: input.command,
      });
    },
    async detect_cli(input: AiCliCheckRequest) {
      return await tauri_invoke<AiCliProbe>("ai_detect_cli", {
        command: input.command,
      });
    },
    async execute(input: AiPortExecuteRequest) {
      return await tauri_invoke<AiExecutionResult>("ai_execute_cli", {
        providerConfig: input.provider_config,
        vaultPath: input.vault_path,
        notePath: input.note_path,
        prompt: input.prompt,
        timeoutSeconds: input.timeout_seconds,
      });
    },
  };
}
