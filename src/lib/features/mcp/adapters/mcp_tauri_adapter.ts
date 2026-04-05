import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import type { McpPort, McpStatusInfo } from "../ports";

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
  };
}
