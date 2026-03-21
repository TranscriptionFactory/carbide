import { describe, it, expect, beforeEach } from "vitest";
import { PluginSettingsStore } from "$lib/features/plugin/state/plugin_settings_store.svelte";
import type { PluginSettingsEntry } from "$lib/features/plugin/ports";

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

describe("PluginSettingsStore", () => {
  let store: PluginSettingsStore;

  beforeEach(() => {
    store = new PluginSettingsStore();
  });

  describe("load_from_data", () => {
    it("populates entries from a data record", () => {
      store.load_from_data({
        "plugin-a": make_entry({ settings: { theme: "dark" } }),
        "plugin-b": make_entry({ permissions_granted: ["fs:read"] }),
      });

      expect(store.entries.size).toBe(2);
      expect(store.get_entry("plugin-a")?.settings.theme).toBe("dark");
      expect(store.get_entry("plugin-b")?.permissions_granted).toContain(
        "fs:read",
      );
    });

    it("replaces existing entries on subsequent loads", () => {
      store.load_from_data({ "plugin-a": make_entry() });
      store.load_from_data({ "plugin-b": make_entry() });

      expect(store.entries.has("plugin-a")).toBe(false);
      expect(store.entries.has("plugin-b")).toBe(true);
    });

    it("clears entries when given an empty record", () => {
      store.load_from_data({ "plugin-a": make_entry() });
      store.load_from_data({});
      expect(store.entries.size).toBe(0);
    });
  });

  describe("get_entry / set_entry", () => {
    it("returns undefined for unknown plugin", () => {
      expect(store.get_entry("unknown")).toBeUndefined();
    });

    it("stores and retrieves an entry", () => {
      const entry = make_entry({ settings: { key: "value" } });
      store.set_entry("plugin-a", entry);
      expect(store.get_entry("plugin-a")).toEqual(entry);
    });

    it("overwrites an existing entry", () => {
      store.set_entry("plugin-a", make_entry({ settings: { x: 1 } }));
      store.set_entry("plugin-a", make_entry({ settings: { x: 2 } }));
      expect(store.get_entry("plugin-a")?.settings.x).toBe(2);
    });
  });

  describe("get_setting / set_setting", () => {
    it("returns undefined when plugin entry does not exist", () => {
      expect(store.get_setting("plugin-a", "theme")).toBeUndefined();
    });

    it("returns undefined for a missing key in an existing entry", () => {
      store.set_entry("plugin-a", make_entry());
      expect(store.get_setting("plugin-a", "theme")).toBeUndefined();
    });

    it("reads a setting that was set via load_from_data", () => {
      store.load_from_data({
        "plugin-a": make_entry({ settings: { color: "blue" } }),
      });
      expect(store.get_setting("plugin-a", "color")).toBe("blue");
    });

    it("set_setting updates a key in an existing entry", () => {
      store.set_entry("plugin-a", make_entry({ settings: { count: 0 } }));
      store.set_setting("plugin-a", "count", 42);
      expect(store.get_setting("plugin-a", "count")).toBe(42);
    });

    it("set_setting does nothing when plugin entry is missing", () => {
      store.set_setting("unknown", "key", "value");
      expect(store.get_entry("unknown")).toBeUndefined();
    });

    it("set_setting preserves other keys in the entry", () => {
      store.set_entry("plugin-a", make_entry({ settings: { a: 1, b: 2 } }));
      store.set_setting("plugin-a", "a", 99);
      expect(store.get_setting("plugin-a", "b")).toBe(2);
    });
  });

  describe("is_permission_granted", () => {
    it("returns false when plugin entry does not exist", () => {
      expect(store.is_permission_granted("plugin-a", "fs:read")).toBe(false);
    });

    it("returns false when permission is not in granted list", () => {
      store.set_entry(
        "plugin-a",
        make_entry({ permissions_granted: ["ui:panel"] }),
      );
      expect(store.is_permission_granted("plugin-a", "fs:read")).toBe(false);
    });

    it("returns true when permission is in granted list", () => {
      store.set_entry(
        "plugin-a",
        make_entry({ permissions_granted: ["fs:read"] }),
      );
      expect(store.is_permission_granted("plugin-a", "fs:read")).toBe(true);
    });
  });

  describe("get_pending_permissions", () => {
    it("returns empty array when plugin entry does not exist", () => {
      expect(store.get_pending_permissions("unknown")).toEqual([]);
    });

    it("returns empty array when no pending permissions", () => {
      store.set_entry("plugin-a", make_entry());
      expect(store.get_pending_permissions("plugin-a")).toEqual([]);
    });

    it("returns pending permissions list", () => {
      store.set_entry(
        "plugin-a",
        make_entry({ permissions_pending: ["fs:write", "ui:panel"] }),
      );
      expect(store.get_pending_permissions("plugin-a")).toEqual([
        "fs:write",
        "ui:panel",
      ]);
    });
  });

  describe("clear", () => {
    it("removes all entries", () => {
      store.load_from_data({
        "plugin-a": make_entry(),
        "plugin-b": make_entry(),
      });
      store.clear();
      expect(store.entries.size).toBe(0);
    });

    it("is safe to call on an empty store", () => {
      expect(() => store.clear()).not.toThrow();
    });
  });
});
