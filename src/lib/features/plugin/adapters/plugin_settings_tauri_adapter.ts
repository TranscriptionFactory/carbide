import { invoke } from "@tauri-apps/api/core";
import type { PluginSettingsPort, PluginSettingsData } from "../ports";

export class PluginSettingsTauriAdapter implements PluginSettingsPort {
  async read_settings(vault_path: string): Promise<PluginSettingsData> {
    return invoke<PluginSettingsData>("plugin_read_settings", { vault_path });
  }

  async write_settings(
    vault_path: string,
    settings: PluginSettingsData,
  ): Promise<void> {
    return invoke("plugin_write_settings", { vault_path, settings });
  }

  async approve_permission(
    vault_path: string,
    plugin_id: string,
    permission: string,
  ): Promise<void> {
    return invoke("plugin_approve_permission", {
      vault_path,
      plugin_id,
      permission,
    });
  }

  async deny_permission(
    vault_path: string,
    plugin_id: string,
    permission: string,
  ): Promise<void> {
    return invoke("plugin_deny_permission", {
      vault_path,
      plugin_id,
      permission,
    });
  }
}
