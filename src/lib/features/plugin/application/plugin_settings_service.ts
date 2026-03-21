import type { PluginSettingsStore } from "../state/plugin_settings_store.svelte";
import type {
  PluginManifest,
  PluginSettingsData,
  PluginSettingsEntry,
  PluginSettingsPort,
} from "../ports";
import type { VaultStore } from "$lib/features/vault";

const SAVE_DEBOUNCE_MS = 300;
export const PLUGIN_SETTINGS_SCHEMA_VERSION = 1;

function manifest_default_settings(
  manifest: PluginManifest,
): Record<string, unknown> {
  return Object.fromEntries(
    (manifest.contributes?.settings ?? [])
      .filter((setting) => setting.default !== undefined)
      .map((setting) => [setting.key, setting.default]),
  );
}

function requested_permissions(manifest: PluginManifest): string[] {
  return Array.from(new Set(manifest.permissions));
}

function create_entry_from_manifest(input: {
  manifest: PluginManifest;
  existing: PluginSettingsEntry | undefined;
  source: string;
}): PluginSettingsEntry {
  const permissions_requested = requested_permissions(input.manifest);
  const permissions_granted = (
    input.existing?.permissions_granted ?? []
  ).filter((permission) => permissions_requested.includes(permission));

  return {
    enabled: input.existing?.enabled ?? false,
    version: input.manifest.version,
    source: input.existing?.source ?? input.source,
    permissions_granted,
    permissions_pending: permissions_requested.filter(
      (permission) => !permissions_granted.includes(permission),
    ),
    settings: {
      ...manifest_default_settings(input.manifest),
      ...(input.existing?.settings ?? {}),
    },
    content_hash: input.existing?.content_hash ?? null,
  };
}

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
      schema_version: PLUGIN_SETTINGS_SCHEMA_VERSION,
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

  sync_manifest_entry(
    manifest: PluginManifest,
    source = "local",
  ): { changed: boolean; entry: PluginSettingsEntry } {
    const existing = this.store.get_entry(manifest.id);
    const entry = create_entry_from_manifest({
      manifest,
      existing,
      source,
    });
    const changed = JSON.stringify(existing) !== JSON.stringify(entry);

    this.store.set_entry(manifest.id, entry);

    return { changed, entry };
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

  async set_enabled(plugin_id: string, enabled: boolean): Promise<void> {
    const entry = this.store.get_entry(plugin_id);
    if (!entry) return;

    this.store.set_entry(plugin_id, {
      ...entry,
      enabled,
    });
    await this.save();
  }

  ensure_plugin_entry(plugin_id: string) {
    if (!this.store.get_entry(plugin_id)) {
      this.store.set_entry(plugin_id, {
        enabled: false,
        version: "",
        source: "local",
        permissions_granted: [],
        permissions_pending: [],
        settings: {},
        content_hash: null,
      });
    }
  }
}
