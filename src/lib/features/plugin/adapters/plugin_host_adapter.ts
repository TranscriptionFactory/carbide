import { invoke } from "@tauri-apps/api/core";
import type { PluginHostPort, DiscoveredPlugin } from "../ports";

export class PluginHostAdapter implements PluginHostPort {
  async discover(vault_path: string): Promise<DiscoveredPlugin[]> {
    try {
      return await invoke<DiscoveredPlugin[]>("plugin_discover", {
        vaultPath: vault_path,
      });
    } catch (e) {
      console.error("Failed to discover plugins:", e);
      return [];
    }
  }

  async load(vault_path: string, id: string): Promise<void> {
    await invoke("plugin_load", { vaultPath: vault_path, pluginId: id });
  }

  async unload(id: string): Promise<void> {
    await invoke("plugin_unload", { pluginId: id });
  }
}
