import { invoke } from "@tauri-apps/api/core";
import type { PluginHostPort, DiscoveredPlugin } from "../ports";

export class PluginHostAdapter implements PluginHostPort {
  async discover(vault_path: string): Promise<DiscoveredPlugin[]> {
    try {
      return await invoke<DiscoveredPlugin[]>("plugin_discover", {
        vault_path,
      });
    } catch (e) {
      console.error("Failed to discover plugins:", e);
      return [];
    }
  }

  async load(_id: string): Promise<void> {}

  async unload(_id: string): Promise<void> {}
}
