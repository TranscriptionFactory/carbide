import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { PluginHostPort, DiscoveredPlugin, PluginFsEvent } from "../ports";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("plugin_host_adapter");

export class PluginHostAdapter implements PluginHostPort {
  async install_bundled(): Promise<string[]> {
    try {
      return await invoke<string[]>("plugin_install_bundled");
    } catch (e) {
      log.from_error("Failed to install bundled plugins:", e);
      return [];
    }
  }

  async discover(vault_path: string): Promise<DiscoveredPlugin[]> {
    try {
      return await invoke<DiscoveredPlugin[]>("plugin_discover", {
        vaultPath: vault_path,
      });
    } catch (e) {
      log.from_error("Failed to discover plugins:", e);
      return [];
    }
  }

  async load(vault_path: string, id: string): Promise<void> {
    await invoke("plugin_load", { vaultPath: vault_path, pluginId: id });
  }

  async unload(id: string): Promise<void> {
    await invoke("plugin_unload", { pluginId: id });
  }

  async watch(vault_path: string): Promise<void> {
    await invoke("watch_plugins", { vaultPath: vault_path });
  }

  async unwatch(): Promise<void> {
    await invoke("unwatch_plugins");
  }

  subscribe_plugin_changes(
    callback: (event: PluginFsEvent) => void,
  ): () => void {
    let unlisten_fn: (() => void) | null = null;
    let is_disposed = false;

    void listen<{ type: string; plugin_id: string }>(
      "plugin_fs_event",
      (event) => {
        if (is_disposed) return;
        callback({
          type: "plugin_changed",
          plugin_id: event.payload.plugin_id,
        });
      },
    )
      .then((fn_ref) => {
        if (is_disposed) {
          try {
            void Promise.resolve(fn_ref()).catch(() => {});
          } catch {
            // already unregistered
          }
          return;
        }
        unlisten_fn = fn_ref;
      })
      .catch(() => {});

    return () => {
      is_disposed = true;
      if (unlisten_fn) {
        unlisten_fn();
        unlisten_fn = null;
      }
    };
  }
}
