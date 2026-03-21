import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PluginSettingsService } from "$lib/features/plugin/application/plugin_settings_service";
import { PluginSettingsStore } from "$lib/features/plugin/state/plugin_settings_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import type {
  PluginManifest,
  PluginSettingsData,
  PluginSettingsEntry,
  PluginSettingsPort,
} from "$lib/features/plugin/ports";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_vault_id, as_vault_path } from "$lib/shared/types/ids";

function make_mock_port(): PluginSettingsPort {
  return {
    read_settings: vi.fn().mockResolvedValue({
      schema_version: 1,
      plugins: {},
    } as PluginSettingsData),
    write_settings: vi.fn().mockResolvedValue(undefined),
    approve_permission: vi.fn().mockResolvedValue(undefined),
    deny_permission: vi.fn().mockResolvedValue(undefined),
  };
}

function make_entry(
  overrides?: Partial<PluginSettingsEntry>,
): PluginSettingsEntry {
  return {
    enabled: false,
    version: "",
    source: "local",
    permissions_granted: [],
    permissions_pending: [],
    settings: {},
    content_hash: null,
    ...overrides,
  };
}

function make_manifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: "plugin-a",
    name: "Plugin A",
    version: "1.0.0",
    author: "Test",
    description: "",
    api_version: "1",
    permissions: [],
    ...overrides,
  };
}

function make_harness(with_vault = true) {
  const store = new PluginSettingsStore();
  const vault_store = new VaultStore();
  if (with_vault) vault_store.set_vault(create_test_vault());
  const port = make_mock_port();
  const service = new PluginSettingsService(store, vault_store, port);
  return {
    store,
    vault_store,
    port,
    service,
  };
}

describe("PluginSettingsService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("load", () => {
    it("reads from port and populates store", async () => {
      const { service, store, port } = make_harness();
      vi.mocked(port.read_settings).mockResolvedValueOnce({
        schema_version: 1,
        plugins: {
          "plugin-a": make_entry({
            version: "1.0.0",
            permissions_granted: ["fs:read"],
            settings: { theme: "dark" },
          }),
        },
      });

      await service.load();

      expect(port.read_settings).toHaveBeenCalledWith("/test/vault");
      expect(store.get_entry("plugin-a")?.settings.theme).toBe("dark");
    });

    it("is a no-op when vault_path is undefined", async () => {
      const { service, port } = make_harness(false);
      await service.load();
      expect(port.read_settings).not.toHaveBeenCalled();
    });

    it("ignores stale load results after the active vault changes", async () => {
      const { service, store, port, vault_store } = make_harness();
      let resolve_settings: ((value: PluginSettingsData) => void) | undefined;
      vi.mocked(port.read_settings).mockReturnValueOnce(
        new Promise<PluginSettingsData>((resolve) => {
          resolve_settings = resolve;
        }),
      );

      const load_promise = service.load();
      vault_store.set_vault({
        ...create_test_vault(),
        id: as_vault_id("vault-2"),
        path: as_vault_path("/test/vault-2"),
      });
      resolve_settings?.({
        schema_version: 1,
        plugins: {
          "plugin-a": make_entry({
            version: "1.0.0",
            settings: { theme: "dark" },
          }),
        },
      });

      await load_promise;

      expect(store.get_entry("plugin-a")).toBeUndefined();
    });
  });

  describe("save", () => {
    it("writes current store state to port", async () => {
      const { service, store, port } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          settings: { count: 5 },
        }),
      );

      await service.save();

      expect(port.write_settings).toHaveBeenCalledWith("/test/vault", {
        schema_version: 1,
        plugins: {
          "plugin-a": make_entry({
            version: "1.0.0",
            settings: { count: 5 },
          }),
        },
      });
    });

    it("is a no-op when vault_path is undefined", async () => {
      const { service, port } = make_harness(false);
      await service.save();
      expect(port.write_settings).not.toHaveBeenCalled();
    });
  });

  describe("get_setting / set_setting", () => {
    it("get_setting delegates to store", async () => {
      const { service, store } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          settings: { color: "blue" },
        }),
      );

      const value = await service.get_setting("plugin-a", "color");
      expect(value).toBe("blue");
    });

    it("set_setting updates store immediately", async () => {
      const { service, store } = make_harness();
      store.set_entry("plugin-a", make_entry({ version: "1.0.0" }));

      await service.set_setting("plugin-a", "theme", "light");
      expect(store.get_setting("plugin-a", "theme")).toBe("light");
    });

    it("set_setting debounces save", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", make_entry({ version: "1.0.0" }));

      await service.set_setting("plugin-a", "a", 1);
      await service.set_setting("plugin-a", "b", 2);

      expect(port.write_settings).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);

      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("flush forces pending save", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", make_entry({ version: "1.0.0" }));

      await service.set_setting("plugin-a", "x", 42);
      expect(port.write_settings).not.toHaveBeenCalled();

      await service.flush();
      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("clear cancels a pending debounced save", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", make_entry({ version: "1.0.0" }));

      await service.set_setting("plugin-a", "theme", "light");
      service.clear();
      await vi.advanceTimersByTimeAsync(300);

      expect(port.write_settings).not.toHaveBeenCalled();
    });

    it("get_all_settings returns all settings for a plugin", async () => {
      const { service, store } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          settings: { a: 1, b: "two" },
        }),
      );

      const all = await service.get_all_settings("plugin-a");
      expect(all).toEqual({ a: 1, b: "two" });
    });

    it("get_all_settings returns empty object for unknown plugin", async () => {
      const { service } = make_harness();
      const all = await service.get_all_settings("unknown");
      expect(all).toEqual({});
    });
  });

  describe("sync_manifest_entry", () => {
    it("creates an entry from manifest metadata and defaults", () => {
      const { service, store } = make_harness();
      const manifest = make_manifest({
        permissions: ["editor:read", "settings:register"],
        contributes: {
          settings: [
            {
              key: "auto_tag_on_save",
              type: "boolean",
              label: "Auto-tag on save",
              default: false,
            },
          ],
        },
      });

      const result = service.sync_manifest_entry(manifest);

      expect(result.changed).toBe(true);
      expect(store.get_entry("plugin-a")).toEqual(
        make_entry({
          version: "1.0.0",
          permissions_pending: ["editor:read", "settings:register"],
          settings: { auto_tag_on_save: false },
        }),
      );
    });

    it("preserves explicit user values while hydrating missing defaults", () => {
      const { service, store } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          enabled: true,
          version: "0.9.0",
          permissions_granted: ["editor:read", "fs:read"],
          settings: { auto_tag_on_save: true },
        }),
      );

      const result = service.sync_manifest_entry(
        make_manifest({
          version: "2.0.0",
          permissions: ["editor:read", "commands:register"],
          contributes: {
            settings: [
              {
                key: "auto_tag_on_save",
                type: "boolean",
                label: "Auto-tag on save",
                default: false,
              },
              {
                key: "mode",
                type: "string",
                label: "Mode",
                default: "all",
              },
            ],
          },
        }),
      );

      expect(result.changed).toBe(true);
      expect(store.get_entry("plugin-a")).toEqual(
        make_entry({
          enabled: true,
          version: "2.0.0",
          permissions_granted: ["editor:read"],
          permissions_pending: ["commands:register"],
          settings: {
            auto_tag_on_save: true,
            mode: "all",
          },
        }),
      );
    });
  });

  describe("set_enabled", () => {
    it("updates the enabled flag and persists it", async () => {
      const { service, store, port } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
        }),
      );

      await service.set_enabled("plugin-a", true);

      expect(store.get_entry("plugin-a")?.enabled).toBe(true);
      expect(port.write_settings).toHaveBeenCalledOnce();
    });
  });

  describe("approve_permission", () => {
    it("moves permission from pending to granted and saves", async () => {
      const { service, store, port } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          permissions_pending: ["fs:read"],
        }),
      );

      await service.approve_permission("plugin-a", "fs:read");

      const entry = store.get_entry("plugin-a");
      expect(entry?.permissions_granted).toContain("fs:read");
      expect(entry?.permissions_pending).not.toContain("fs:read");
      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("does not duplicate an already-granted permission", async () => {
      const { service, store } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          permissions_granted: ["fs:read"],
          permissions_pending: ["fs:read"],
        }),
      );

      await service.approve_permission("plugin-a", "fs:read");

      const entry = store.get_entry("plugin-a");
      expect(
        entry?.permissions_granted.filter((p) => p === "fs:read"),
      ).toHaveLength(1);
    });

    it("is a no-op when vault_path is undefined", async () => {
      const { service, port } = make_harness(false);
      await service.approve_permission("plugin-a", "fs:read");
      expect(port.write_settings).not.toHaveBeenCalled();
    });
  });

  describe("deny_permission", () => {
    it("removes permission from pending list and saves", async () => {
      const { service, store, port } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          permissions_pending: ["fs:write"],
        }),
      );

      await service.deny_permission("plugin-a", "fs:write");

      expect(store.get_entry("plugin-a")?.permissions_pending).not.toContain(
        "fs:write",
      );
      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("does not add permission to granted list", async () => {
      const { service, store } = make_harness();
      store.set_entry(
        "plugin-a",
        make_entry({
          version: "1.0.0",
          permissions_pending: ["fs:write"],
        }),
      );

      await service.deny_permission("plugin-a", "fs:write");

      expect(store.get_entry("plugin-a")?.permissions_granted).toHaveLength(0);
    });

    it("is a no-op when vault_path is undefined", async () => {
      const { service, port } = make_harness(false);
      await service.deny_permission("plugin-a", "fs:write");
      expect(port.write_settings).not.toHaveBeenCalled();
    });
  });
});
