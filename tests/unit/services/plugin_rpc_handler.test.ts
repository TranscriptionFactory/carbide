import { describe, expect, it, vi, beforeEach } from "vitest";
import { PluginRpcHandler } from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginManifest } from "$lib/features/plugin/ports";
import { PluginEventBus } from "$lib/features/plugin/application/plugin_event_bus";

vi.mock("svelte-sonner", () => ({ toast: { info: vi.fn() } }));
import { toast } from "svelte-sonner";

function make_manifest(permissions: string[]): PluginManifest {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "0.1.0",
    permissions,
    entry: "index.js",
  } as unknown as PluginManifest;
}

function make_context() {
  const plugin = {
    register_command: vi.fn(),
    unregister_command: vi.fn(),
    register_status_bar_item: vi.fn(),
    update_status_bar_item: vi.fn(),
    unregister_status_bar_item: vi.fn(),
    register_sidebar_view: vi.fn(),
    unregister_sidebar_view: vi.fn(),
    register_settings_tab: vi.fn(),
  };

  return {
    services: { plugin } as any,
    stores: {} as any,
    plugin,
  };
}

const PLUGIN_ID = "test-plugin";

describe("PluginRpcHandler", () => {
  let ctx: ReturnType<typeof make_context>;
  let handler: PluginRpcHandler;

  beforeEach(() => {
    ctx = make_context();
    handler = new PluginRpcHandler(ctx);
  });

  describe("commands.remove", () => {
    it("removes a previously registered command", async () => {
      const manifest = make_manifest(["commands:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "1",
        method: "commands.remove",
        params: ["my-command"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.unregister_command).toHaveBeenCalledWith(
        `${PLUGIN_ID}:my-command`,
      );
    });

    it("throws when missing commands:register permission", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "1",
        method: "commands.remove",
        params: ["my-command"],
      });

      expect(response.error).toMatch(/Missing commands:register permission/);
      expect(ctx.plugin.unregister_command).not.toHaveBeenCalled();
    });
  });

  describe("ui.add_sidebar_panel", () => {
    it("registers a sidebar view with namespaced id", async () => {
      const manifest = make_manifest(["ui:panel"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "2",
        method: "ui.add_sidebar_panel",
        params: [{ id: "my-panel", label: "My Panel", icon: {} }],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.register_sidebar_view).toHaveBeenCalledOnce();
      const call = ctx.plugin.register_sidebar_view.mock.calls[0]?.[0];
      expect(call?.id).toBe(`${PLUGIN_ID}:my-panel`);
      expect(call?.label).toBe("My Panel");
    });

    it("throws when missing ui:panel permission", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "2",
        method: "ui.add_sidebar_panel",
        params: [{ id: "my-panel", label: "My Panel", icon: {} }],
      });

      expect(response.error).toMatch(/Missing ui:panel permission/);
      expect(ctx.plugin.register_sidebar_view).not.toHaveBeenCalled();
    });
  });

  describe("ui.remove_statusbar_item", () => {
    it("unregisters a status bar item", async () => {
      const manifest = make_manifest(["ui:statusbar"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "3",
        method: "ui.remove_statusbar_item",
        params: ["my-item"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.unregister_status_bar_item).toHaveBeenCalledWith(
        `${PLUGIN_ID}:my-item`,
      );
    });

    it("throws when missing ui:statusbar permission", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "3",
        method: "ui.remove_statusbar_item",
        params: ["my-item"],
      });

      expect(response.error).toMatch(/Missing ui:statusbar permission/);
      expect(ctx.plugin.unregister_status_bar_item).not.toHaveBeenCalled();
    });
  });

  describe("ui.remove_sidebar_panel", () => {
    it("unregisters a sidebar view", async () => {
      const manifest = make_manifest(["ui:panel"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "4",
        method: "ui.remove_sidebar_panel",
        params: ["my-panel"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.unregister_sidebar_view).toHaveBeenCalledWith(
        `${PLUGIN_ID}:my-panel`,
      );
    });

    it("throws when missing ui:panel permission", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "4",
        method: "ui.remove_sidebar_panel",
        params: ["my-panel"],
      });

      expect(response.error).toMatch(/Missing ui:panel permission/);
      expect(ctx.plugin.unregister_sidebar_view).not.toHaveBeenCalled();
    });
  });

  describe("ui.show_notice", () => {
    it("dispatches a toast with the given message", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "5",
        method: "ui.show_notice",
        params: [{ message: "Hello from plugin", duration: 3000 }],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(vi.mocked(toast.info)).toHaveBeenCalledWith("Hello from plugin", {
        duration: 3000,
      });
    });

    it("uses default duration when not provided", async () => {
      const manifest = make_manifest([]);
      await handler.handle_request(PLUGIN_ID, manifest, {
        id: "5",
        method: "ui.show_notice",
        params: [{ message: "Notice" }],
      });

      expect(vi.mocked(toast.info)).toHaveBeenCalledWith("Notice", {
        duration: 4000,
      });
    });

    it("returns error when message is missing", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "5",
        method: "ui.show_notice",
        params: [{}],
      });

      expect(response.error).toMatch(/Missing message parameter/);
    });
  });

  describe("settings.*", () => {
    function make_settings_service() {
      return {
        get_setting: vi.fn().mockResolvedValue("stored-value"),
        set_setting: vi.fn().mockResolvedValue(undefined),
        get_all_settings: vi
          .fn()
          .mockResolvedValue({ theme: "dark", count: 1 }),
      };
    }

    it("settings.get returns a setting value without permission check", async () => {
      const svc = make_settings_service();
      handler.set_settings_service(svc as any);

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s1",
        method: "settings.get",
        params: ["theme"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toBe("stored-value");
      expect(svc.get_setting).toHaveBeenCalledWith(PLUGIN_ID, "theme");
    });

    it("settings.set writes a setting and returns success", async () => {
      const svc = make_settings_service();
      handler.set_settings_service(svc as any);

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s2",
        method: "settings.set",
        params: ["theme", "light"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(svc.set_setting).toHaveBeenCalledWith(PLUGIN_ID, "theme", "light");
    });

    it("settings.get_all returns all settings for the plugin", async () => {
      const svc = make_settings_service();
      handler.set_settings_service(svc as any);

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s3",
        method: "settings.get_all",
        params: [],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ theme: "dark", count: 1 });
      expect(svc.get_all_settings).toHaveBeenCalledWith(PLUGIN_ID);
    });

    it("settings.* errors when settings service not initialized", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s4",
        method: "settings.get",
        params: ["key"],
      });

      expect(response.error).toMatch(/Settings service not initialized/);
    });

    it("settings.register_tab registers a settings tab with given label", async () => {
      const svc = make_settings_service();
      handler.set_settings_service(svc as any);

      const manifest = make_manifest(["settings:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s5",
        method: "settings.register_tab",
        params: [{ label: "My Settings" }],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(ctx.plugin.register_settings_tab).toHaveBeenCalledWith({
        plugin_id: PLUGIN_ID,
        label: "My Settings",
        icon: undefined,
      });
    });

    it("settings.register_tab falls back to manifest name when label not provided", async () => {
      const svc = make_settings_service();
      handler.set_settings_service(svc as any);

      const manifest = make_manifest(["settings:register"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s6",
        method: "settings.register_tab",
        params: [{}],
      });

      expect(response.error).toBeUndefined();
      expect(ctx.plugin.register_settings_tab).toHaveBeenCalledWith({
        plugin_id: PLUGIN_ID,
        label: manifest.name,
        icon: undefined,
      });
    });

    it("settings.register_tab throws without settings:register permission", async () => {
      const svc = make_settings_service();
      handler.set_settings_service(svc as any);

      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "s7",
        method: "settings.register_tab",
        params: [{ label: "My Settings" }],
      });

      expect(response.error).toMatch(/Missing settings:register permission/);
      expect(ctx.plugin.register_settings_tab).not.toHaveBeenCalled();
    });
  });

  describe("events.*", () => {
    let event_bus: PluginEventBus;

    beforeEach(() => {
      event_bus = new PluginEventBus();
      handler.set_event_bus(event_bus);
    });

    it("events.on subscribes to an event type", async () => {
      const manifest = make_manifest(["events:subscribe"]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "e1",
        method: "events.on",
        params: ["file-created", "cb-1"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(event_bus.get_subscription_count(PLUGIN_ID)).toBe(1);
    });

    it("events.off unsubscribes a callback", async () => {
      const manifest = make_manifest(["events:subscribe"]);
      event_bus.subscribe(PLUGIN_ID, "file-created", "cb-1");

      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "e2",
        method: "events.off",
        params: ["cb-1"],
      });

      expect(response.error).toBeUndefined();
      expect(response.result).toEqual({ success: true });
      expect(event_bus.get_subscription_count(PLUGIN_ID)).toBe(0);
    });

    it("events.* throws without events:subscribe permission", async () => {
      const manifest = make_manifest([]);
      const response = await handler.handle_request(PLUGIN_ID, manifest, {
        id: "e3",
        method: "events.on",
        params: ["file-created", "cb-1"],
      });

      expect(response.error).toMatch(/Missing events:subscribe permission/);
    });

    it("events.* errors when event bus not initialized", async () => {
      const fresh_handler = new PluginRpcHandler(ctx);
      const manifest = make_manifest(["events:subscribe"]);
      const response = await fresh_handler.handle_request(PLUGIN_ID, manifest, {
        id: "e4",
        method: "events.on",
        params: ["file-created", "cb-1"],
      });

      expect(response.error).toMatch(/Event bus not initialized/);
    });
  });
});
