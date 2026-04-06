import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type {
  McpPort,
  McpStatusInfo,
  McpSetupResult,
  McpSetupStatus,
} from "../ports";

export function create_mcp_tauri_adapter(): McpPort {
  return {
    async start() {
      return tauri_invoke<McpStatusInfo>("mcp_start");
    },
    async stop() {
      await tauri_invoke<void>("mcp_stop");
    },
    async get_status() {
      return tauri_invoke<McpStatusInfo>("mcp_status");
    },
    async setup_claude_desktop() {
      return tauri_invoke<McpSetupResult>("mcp_setup_claude_desktop");
    },
    async setup_claude_code(vault_id: string) {
      return tauri_invoke<McpSetupResult>("mcp_setup_claude_code", {
        vaultId: vault_id,
      });
    },
    async regenerate_token() {
      return tauri_invoke<string>("mcp_regenerate_token");
    },
    async get_setup_status() {
      return tauri_invoke<McpSetupStatus>("mcp_get_setup_status");
    },
  };
}
