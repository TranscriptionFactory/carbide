import { invoke } from "@tauri-apps/api/core";

export type ExternalMcpStatus =
  | { status: "stopped" }
  | { status: "starting" }
  | { status: "running"; tool_count: number }
  | { status: "error"; message: string };

export interface ExternalMcpAdapter {
  start(
    server_id: string,
    binary: string,
    args: string[],
    env_vars: Record<string, string>,
    working_dir?: string,
  ): Promise<void>;
  stop(server_id: string): Promise<void>;
  call_tool(
    server_id: string,
    tool_name: string,
    arguments?: Record<string, unknown>,
  ): Promise<unknown>;
  status(server_id: string): Promise<ExternalMcpStatus>;
}

export const external_mcp_tauri_adapter: ExternalMcpAdapter = {
  async start(server_id, binary, args, env_vars, working_dir) {
    await invoke("external_mcp_start", {
      serverId: server_id,
      binary,
      args,
      envVars: env_vars,
      workingDir: working_dir ?? null,
    });
  },

  async stop(server_id) {
    await invoke("external_mcp_stop", { serverId: server_id });
  },

  async call_tool(server_id, tool_name, arguments_) {
    return invoke("external_mcp_call_tool", {
      serverId: server_id,
      toolName: tool_name,
      arguments: arguments_ ?? null,
    });
  },

  async status(server_id) {
    return invoke<ExternalMcpStatus>("external_mcp_status", {
      serverId: server_id,
    });
  },
};
