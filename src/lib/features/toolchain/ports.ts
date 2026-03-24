import type { ToolInfo, ToolchainEvent } from "$lib/features/toolchain/types";

export interface ToolchainPort {
  list_tools(): Promise<ToolInfo[]>;
  install(tool_id: string): Promise<void>;
  uninstall(tool_id: string): Promise<void>;
  resolve(tool_id: string): Promise<string>;
  subscribe_events(callback: (event: ToolchainEvent) => void): () => void;
}
