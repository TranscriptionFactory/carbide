import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type {
  AiCliCheckRequest,
  AiCliProbe,
  AiExecutionResult,
  AiPortExecuteRequest,
  AiProviderConfig,
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
    async set_api_key(provider_id: string, key: string) {
      await tauri_invoke<void>("ai_set_api_key", {
        providerId: provider_id,
        key,
      });
    },
    async delete_api_key(provider_id: string) {
      await tauri_invoke<void>("ai_delete_api_key", {
        providerId: provider_id,
      });
    },
    async get_api_key_hint(provider_id: string) {
      return await tauri_invoke<string | null>("ai_has_api_key", {
        providerId: provider_id,
      });
    },
    async test_provider(config: AiProviderConfig) {
      return await tauri_invoke<string>("ai_test_provider", {
        providerConfig: config,
      });
    },
  };
}
