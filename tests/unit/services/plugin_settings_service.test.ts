import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PluginSettingsService } from "$lib/features/plugin/application/plugin_settings_service";
import { PluginSettingsStore } from "$lib/features/plugin/state/plugin_settings_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import type {
  PluginSettingsPort,
  PluginSettingsData,
} from "$lib/features/plugin/ports";
import { create_test_vault } from "../helpers/test_fixtures";

function make_mock_port(): PluginSettingsPort {
  return {
    read_settings: vi
      .fn()
      .mockResolvedValue({ plugins: {} } as PluginSettingsData),
    write_settings: vi.fn().mockResolvedValue(undefined),
    approve_permission: vi.fn().mockResolvedValue(undefined),
    deny_permission: vi.fn().mockResolvedValue(undefined),
  };
}

function make_harness(with_vault = true) {
  const store = new PluginSettingsStore();
  const vault_store = new VaultStore();
  if (with_vault) vault_store.set_vault(create_test_vault());
  const port = make_mock_port();
  const service = new PluginSettingsService(store, vault_store, port);
  return { store, vault_store, port, service };
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
        plugins: {
          "plugin-a": {
            permissions_granted: ["fs:read"],
            permissions_pending: [],
            settings: { theme: "dark" },
            content_hash: null,
          },
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
  });

  describe("save", () => {
    it("writes current store state to port", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: [],
        settings: { count: 5 },
        content_hash: null,
      });

      await service.save();

      expect(port.write_settings).toHaveBeenCalledWith("/test/vault", {
        plugins: {
          "plugin-a": {
            permissions_granted: [],
            permissions_pending: [],
            settings: { count: 5 },
            content_hash: null,
          },
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
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: [],
        settings: { color: "blue" },
        content_hash: null,
      });

      const value = await service.get_setting("plugin-a", "color");
      expect(value).toBe("blue");
    });

    it("set_setting updates store immediately", async () => {
      const { service, store } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: [],
        settings: {},
        content_hash: null,
      });

      await service.set_setting("plugin-a", "theme", "light");
      expect(store.get_setting("plugin-a", "theme")).toBe("light");
    });

    it("set_setting debounces save", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: [],
        settings: {},
        content_hash: null,
      });

      await service.set_setting("plugin-a", "a", 1);
      await service.set_setting("plugin-a", "b", 2);

      expect(port.write_settings).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(300);

      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("flush forces pending save", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: [],
        settings: {},
        content_hash: null,
      });

      await service.set_setting("plugin-a", "x", 42);
      expect(port.write_settings).not.toHaveBeenCalled();

      await service.flush();
      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("get_all_settings returns all settings for a plugin", async () => {
      const { service, store } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: [],
        settings: { a: 1, b: "two" },
        content_hash: null,
      });

      const all = await service.get_all_settings("plugin-a");
      expect(all).toEqual({ a: 1, b: "two" });
    });

    it("get_all_settings returns empty object for unknown plugin", async () => {
      const { service } = make_harness();
      const all = await service.get_all_settings("unknown");
      expect(all).toEqual({});
    });
  });

  describe("approve_permission", () => {
    it("moves permission from pending to granted and saves", async () => {
      const { service, store, port } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: ["fs:read"],
        settings: {},
        content_hash: null,
      });

      await service.approve_permission("plugin-a", "fs:read");

      const entry = store.get_entry("plugin-a");
      expect(entry?.permissions_granted).toContain("fs:read");
      expect(entry?.permissions_pending).not.toContain("fs:read");
      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("does not duplicate an already-granted permission", async () => {
      const { service, store } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: ["fs:read"],
        permissions_pending: ["fs:read"],
        settings: {},
        content_hash: null,
      });

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
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: ["fs:write"],
        settings: {},
        content_hash: null,
      });

      await service.deny_permission("plugin-a", "fs:write");

      expect(store.get_entry("plugin-a")?.permissions_pending).not.toContain(
        "fs:write",
      );
      expect(port.write_settings).toHaveBeenCalledOnce();
    });

    it("does not add permission to granted list", async () => {
      const { service, store } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: [],
        permissions_pending: ["fs:write"],
        settings: {},
        content_hash: null,
      });

      await service.deny_permission("plugin-a", "fs:write");

      expect(store.get_entry("plugin-a")?.permissions_granted).toHaveLength(0);
    });

    it("is a no-op when vault_path is undefined", async () => {
      const { service, port } = make_harness(false);
      await service.deny_permission("plugin-a", "fs:write");
      expect(port.write_settings).not.toHaveBeenCalled();
    });
  });

  describe("ensure_plugin_entry", () => {
    it("creates a default entry when none exists", () => {
      const { service, store } = make_harness();
      service.ensure_plugin_entry("plugin-a");

      const entry = store.get_entry("plugin-a");
      expect(entry).toBeDefined();
      expect(entry?.permissions_granted).toEqual([]);
      expect(entry?.permissions_pending).toEqual([]);
      expect(entry?.settings).toEqual({});
      expect(entry?.content_hash).toBeNull();
    });

    it("does not overwrite an existing entry", () => {
      const { service, store } = make_harness();
      store.set_entry("plugin-a", {
        permissions_granted: ["fs:read"],
        permissions_pending: [],
        settings: { key: "kept" },
        content_hash: "abc",
      });

      service.ensure_plugin_entry("plugin-a");

      expect(store.get_entry("plugin-a")?.settings.key).toBe("kept");
      expect(store.get_entry("plugin-a")?.content_hash).toBe("abc");
    });
  });
});
