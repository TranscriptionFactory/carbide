import { describe, it, expect, beforeEach } from "vitest";
import { PluginStore } from "$lib/features/plugin/state/plugin_store.svelte";
import type { PluginManifest, StatusBarItem } from "$lib/features/plugin";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";
import PluginStatusBarItem from "$lib/features/plugin/ui/plugin_status_bar_item.svelte";

function make_command(id: string, icon: string): CommandDefinition {
  return {
    id: id as CommandDefinition["id"],
    label: "Test Command",
    description: "Test",
    keywords: [],
    icon: icon as CommandDefinition["icon"],
  };
}

function make_manifest(id: string): PluginManifest {
  return {
    id,
    name: id,
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    api_version: "1.0.0",
    permissions: [],
  };
}

describe("PluginStore", () => {
  let store: PluginStore;

  beforeEach(() => {
    store = new PluginStore();
  });

  it("should register and unregister commands", () => {
    const cmd = make_command("test:cmd", "sparkles");

    store.register_command(cmd);
    expect(store.commands).toContain(cmd);

    store.unregister_command(cmd.id);
    expect(store.commands).not.toContain(cmd);
  });

  it("should reset registries", () => {
    store.register_command(make_command("test:cmd", "settings"));

    store.reset_registries();
    expect(store.commands).toHaveLength(0);
  });

  it("should track active plugin ids", () => {
    store.plugins.set("p1", {
      manifest: make_manifest("p1"),
      path: "/plugins/p1",
      enabled: true,
      status: "active",
    });

    store.plugins.set("p2", {
      manifest: make_manifest("p2"),
      path: "/plugins/p2",
      enabled: false,
      status: "idle",
    });

    expect(store.active_plugin_ids).toEqual(["p1"]);
  });

  it("should update status bar item props reactively", () => {
    const item: StatusBarItem = {
      id: "test:bar",
      priority: 1,
      component: PluginStatusBarItem,
      props: { id: "test:bar", text: "hello" },
    };
    store.register_status_bar_item(item);

    store.update_status_bar_item("test:bar", { text: "world" });

    const updated = store.status_bar_items.find((i) => i.id === "test:bar");
    expect(updated?.props).toEqual({ id: "test:bar", text: "world" });
  });

  it("should not fail when updating non-existent status bar item", () => {
    store.update_status_bar_item("nonexistent", { text: "noop" });
  });

  it("should register and unregister settings tabs", () => {
    const tab = {
      plugin_id: "my-plugin",
      label: "My Settings",
      settings_schema: [],
    };

    store.register_settings_tab(tab);
    expect(store.settings_tabs).toContainEqual(tab);

    store.unregister_settings_tab("my-plugin");
    expect(store.settings_tabs).not.toContainEqual(tab);
  });

  it("should key settings tabs by plugin_id (one tab per plugin)", () => {
    store.register_settings_tab({
      plugin_id: "p1",
      label: "First",
      settings_schema: [],
    });
    store.register_settings_tab({
      plugin_id: "p1",
      label: "Second",
      settings_schema: [],
    });

    expect(store.settings_tabs).toHaveLength(1);
    expect(store.settings_tabs[0]?.label).toBe("Second");
  });

  it("should clear settings tabs on reset", () => {
    store.register_settings_tab({
      plugin_id: "p1",
      label: "Tab",
      settings_schema: [],
    });

    store.reset_registries();
    expect(store.settings_tabs).toHaveLength(0);
  });

  it("should register and unregister slash commands", () => {
    const cmd = {
      id: "test:cite",
      name: "Cite",
      description: "Insert citation",
      plugin_id: "test",
    };

    store.register_slash_command(cmd);
    expect(store.slash_commands).toHaveLength(1);
    expect(store.slash_commands[0]?.id).toBe("test:cite");

    store.unregister_slash_command("test:cite");
    expect(store.slash_commands).toHaveLength(0);
  });

  it("should clear slash commands on reset", () => {
    store.register_slash_command({
      id: "test:cmd",
      name: "Test",
      description: "Test",
      plugin_id: "test",
    });

    store.reset_registries();
    expect(store.slash_commands).toHaveLength(0);
  });

  it("should overwrite slash command with same id", () => {
    store.register_slash_command({
      id: "test:cmd",
      name: "V1",
      description: "First",
      plugin_id: "test",
    });
    store.register_slash_command({
      id: "test:cmd",
      name: "V2",
      description: "Second",
      plugin_id: "test",
    });

    expect(store.slash_commands).toHaveLength(1);
    expect(store.slash_commands[0]?.name).toBe("V2");
  });
});
