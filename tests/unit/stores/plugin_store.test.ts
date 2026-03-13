import { describe, it, expect, beforeEach } from "vitest";
import { PluginStore } from "$lib/features/plugin/state/plugin_store.svelte";
import type { CommandDefinition } from "$lib/features/search/types/command_palette";

describe("PluginStore", () => {
  let store: PluginStore;

  beforeEach(() => {
    store = new PluginStore();
  });

  it("should register and unregister commands", () => {
    const cmd: CommandDefinition = {
      id: "test:cmd" as any,
      label: "Test Command",
      description: "Test",
      keywords: [],
      icon: "sparkles" as any,
    };

    store.register_command(cmd);
    expect(store.commands).toContain(cmd);

    store.unregister_command(cmd.id);
    expect(store.commands).not.toContain(cmd);
  });

  it("should reset registries", () => {
    store.register_command({
      id: "test:cmd" as any,
      label: "Test",
      description: "",
      keywords: [],
      icon: "settings" as any,
    });
    
    store.reset_registries();
    expect(store.commands).toHaveLength(0);
  });

  it("should track active plugin ids", () => {
    store.plugins.set("p1", {
      manifest: { id: "p1" } as any,
      enabled: true,
      status: "active",
    });
    
    store.plugins.set("p2", {
      manifest: { id: "p2" } as any,
      enabled: false,
      status: "idle",
    });

    expect(store.active_plugin_ids).toEqual(["p1"]);
  });
});
