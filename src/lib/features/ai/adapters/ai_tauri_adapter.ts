import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type {
  AiCliCheckRequest,
  AiExecutionResult,
  AiPortRequest,
} from "$lib/features/ai/domain/ai_types";
import type { AiPort } from "$lib/features/ai/ports";

export function create_ai_tauri_adapter(): AiPort {
  return {
    async check_cli(input: AiCliCheckRequest) {
      return await tauri_invoke<boolean>("ai_check_cli", {
        provider: input.provider,
        command: input.command,
      });
    },
    async execute(input: AiPortRequest) {
      if (input.provider === "claude") {
        return await tauri_invoke<AiExecutionResult>("ai_execute_claude", {
          vaultPath: input.vault_path,
          notePath: input.note_path,
          prompt: input.prompt,
          command: input.command,
          timeoutSeconds: input.timeout_seconds,
        });
      }
      if (input.provider === "codex") {
        return await tauri_invoke<AiExecutionResult>("ai_execute_codex", {
          vaultPath: input.vault_path,
          notePath: input.note_path,
          prompt: input.prompt,
          command: input.command,
          timeoutSeconds: input.timeout_seconds,
        });
      }
      return await tauri_invoke<AiExecutionResult>("ai_execute_ollama", {
        vaultPath: input.vault_path,
        notePath: input.note_path,
        prompt: input.prompt,
        command: input.command,
        model: input.ollama_model,
        timeoutSeconds: input.timeout_seconds,
      });
    },
  };
}
