import type { PluginSettingsStore } from "../state/plugin_settings_store.svelte";
import type { PluginSettingsPort, PluginSettingsData } from "../ports";
import type { VaultStore } from "$lib/features/vault";

const SAVE_DEBOUNCE_MS = 300;

export class PluginSettingsService {
  private save_timer: ReturnType<typeof setTimeout> | null = null;
  private save_promise: Promise<void> | null = null;

  constructor(
    private store: PluginSettingsStore,
    private vault_store: VaultStore,
    private port: PluginSettingsPort,
  ) {}

  private get vault_path(): string | undefined {
    return this.vault_store.vault?.path;
  }

  async load(): Promise<void> {
    const vault_path = this.vault_path;
    if (!vault_path) return;

    const data = await this.port.read_settings(vault_path);
    this.store.load_from_data(data.plugins);
  }

  async save(): Promise<void> {
    const vault_path = this.vault_path;
    if (!vault_path) return;

    const data: PluginSettingsData = {
      plugins: Object.fromEntries(this.store.entries),
    };
    await this.port.write_settings(vault_path, data);
  }

  private schedule_save(): void {
    if (this.save_timer) clearTimeout(this.save_timer);
    this.save_timer = setTimeout(() => {
      this.save_timer = null;
      this.save_promise = this.save().finally(() => {
        this.save_promise = null;
      });
    }, SAVE_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.save_timer) {
      clearTimeout(this.save_timer);
      this.save_timer = null;
      await this.save();
    } else if (this.save_promise) {
      await this.save_promise;
    }
  }

  async get_setting(plugin_id: string, key: string): Promise<unknown> {
    return this.store.get_setting(plugin_id, key);
  }

  async set_setting(
    plugin_id: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    this.store.set_setting(plugin_id, key, value);
    this.schedule_save();
  }

  async get_all_settings(plugin_id: string): Promise<Record<string, unknown>> {
    return this.store.get_entry(plugin_id)?.settings ?? {};
  }

  private update_permission(
    plugin_id: string,
    permission: string,
    grant: boolean,
  ) {
    const entry = this.store.get_entry(plugin_id);
    if (!entry) return;

    const pending = entry.permissions_pending.filter((p) => p !== permission);
    const granted = grant
      ? entry.permissions_granted.includes(permission)
        ? entry.permissions_granted
        : [...entry.permissions_granted, permission]
      : entry.permissions_granted;

    this.store.set_entry(plugin_id, {
      ...entry,
      permissions_pending: pending,
      permissions_granted: granted,
    });
  }

  async approve_permission(
    plugin_id: string,
    permission: string,
  ): Promise<void> {
    const vault_path = this.vault_path;
    if (!vault_path) return;

    this.update_permission(plugin_id, permission, true);
    await this.save();
  }

  async deny_permission(plugin_id: string, permission: string): Promise<void> {
    const vault_path = this.vault_path;
    if (!vault_path) return;

    this.update_permission(plugin_id, permission, false);
    await this.save();
  }

  ensure_plugin_entry(plugin_id: string) {
    if (!this.store.get_entry(plugin_id)) {
      this.store.set_entry(plugin_id, {
        permissions_granted: [],
        permissions_pending: [],
        settings: {},
        content_hash: null,
      });
    }
  }
}
