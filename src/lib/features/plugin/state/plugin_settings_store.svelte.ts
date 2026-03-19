import { SvelteMap } from "svelte/reactivity";
import type { PluginSettingsEntry } from "../ports";

export class PluginSettingsStore {
  entries = new SvelteMap<string, PluginSettingsEntry>();

  get_entry(plugin_id: string): PluginSettingsEntry | undefined {
    return this.entries.get(plugin_id);
  }

  set_entry(plugin_id: string, entry: PluginSettingsEntry) {
    this.entries.set(plugin_id, entry);
  }

  get_setting(plugin_id: string, key: string): unknown {
    return this.entries.get(plugin_id)?.settings[key];
  }

  set_setting(plugin_id: string, key: string, value: unknown) {
    const entry = this.entries.get(plugin_id);
    if (!entry) return;
    this.entries.set(plugin_id, {
      ...entry,
      settings: { ...entry.settings, [key]: value },
    });
  }

  is_permission_granted(plugin_id: string, permission: string): boolean {
    const entry = this.entries.get(plugin_id);
    return entry?.permissions_granted.includes(permission) ?? false;
  }

  get_pending_permissions(plugin_id: string): string[] {
    return this.entries.get(plugin_id)?.permissions_pending ?? [];
  }

  load_from_data(plugins: Record<string, PluginSettingsEntry>) {
    this.entries.clear();
    for (const [id, entry] of Object.entries(plugins)) {
      this.entries.set(id, entry);
    }
  }

  clear() {
    this.entries.clear();
  }
}
