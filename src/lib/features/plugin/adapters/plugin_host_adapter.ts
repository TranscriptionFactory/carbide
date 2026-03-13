import { invoke } from "@tauri-apps/api/core";
import type { PluginHostPort, PluginManifest } from "../ports";

/**
 * Milestone 1-2 adapter.
 * Discovery via Tauri command.
 * Deferring real iframe/RPC to Milestone 3.
 */
export class PluginHostAdapter implements PluginHostPort {
  async discover(vault_path: string): Promise<PluginManifest[]> {
    try {
      return await invoke<PluginManifest[]>("plugin_discover", {
        vault_path,
      });
    } catch (e) {
      console.error("Failed to discover plugins:", e);
      return [];
    }
  }

  async load(id: string): Promise<void> {
    console.log(`Loading plugin ${id} (mock)`);
  }

  async unload(id: string): Promise<void> {
    console.log(`Unloading plugin ${id} (mock)`);
  }
}
