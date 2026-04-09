import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type {
  McpPort,
  McpStatusInfo,
  McpSetupResult,
  McpSetupStatus,
} from "../ports";

type HttpServerInfo = { port: number; running: boolean };

function to_mcp_status(info: HttpServerInfo): McpStatusInfo {
  return {
    status: info.running ? "running" : "stopped",
    transport: info.running ? `http:${info.port}` : null,
  };
}

export function create_mcp_tauri_adapter(): McpPort {
  return {
    async start() {
      const info = await tauri_invoke<HttpServerInfo>("http_server_start");
      return to_mcp_status(info);
    },
    async stop() {
      await tauri_invoke<void>("http_server_stop");
    },
    async get_status() {
      const info = await tauri_invoke<HttpServerInfo>("http_server_status");
      return to_mcp_status(info);
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
    async install_cli() {
      return tauri_invoke<McpSetupResult>("mcp_install_cli");
    },
    async uninstall_cli() {
      return tauri_invoke<McpSetupResult>("mcp_uninstall_cli");
    },
  };
}
