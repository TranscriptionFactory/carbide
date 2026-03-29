import { describe, expect, it, vi, beforeEach } from "vitest";
import { PluginService } from "$lib/features/plugin/application/plugin_service";
import type { PluginNotificationPort } from "$lib/features/plugin/ports";
import type { RpcRequest } from "$lib/features/plugin/application/plugin_rpc_handler";

function make_manifest(id = "plugin-a", name = "Plugin A") {
  return {
    id,
    name,
    version: "1.0.0",
    author: "test",
    description: "",
    api_version: "1",
    permissions: [],
  };
}

function make_store(plugin_id = "plugin-a") {
  const manifest = make_manifest(plugin_id);
  const plugins = new Map([
    [
      plugin_id,
      {
        manifest,
        path: "/plugins/a",
        enabled: true,
        status: "active" as const,
      },
    ],
  ]);
  const commands: any[] = [];
  const status_bar_items: any[] = [];
  const sidebar_views: any[] = [];
  const ribbon_icons: any[] = [];
  const settings_tabs: any[] = [];
  return {
    plugins,
    commands,
    status_bar_items,
    sidebar_views,
    ribbon_icons,
    settings_tabs,
    register_command: vi.fn(),
    unregister_command: vi.fn(),
    register_status_bar_item: vi.fn(),
    unregister_status_bar_item: vi.fn(),
    update_status_bar_item: vi.fn(),
    register_sidebar_view: vi.fn(),
    unregister_sidebar_view: vi.fn(),
    register_ribbon_icon: vi.fn(),
    unregister_ribbon_icon: vi.fn(),
    register_settings_tab: vi.fn(),
    unregister_settings_tab: vi.fn(),
  };
}

function make_host_port() {
  return {
    discover: vi.fn().mockResolvedValue([]),
    load: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(undefined),
    watch: vi.fn().mockResolvedValue(undefined),
    unwatch: vi.fn().mockResolvedValue(undefined),
    subscribe_plugin_changes: vi.fn().mockReturnValue(() => {}),
  };
}

function make_vault_store() {
  return { vault: { path: "/vault" } } as any;
}

function make_rpc_handler(response: {
  id: string;
  result?: any;
  error?: string;
}) {
  return { handle_request: vi.fn().mockResolvedValue(response) };
}

function make_notification_port(): PluginNotificationPort {
  return {
    notify_plugin_unstable: vi.fn(),
    notify_plugin_auto_disabled: vi.fn(),
  };
}

function make_rpc_request(id = "req-1"): RpcRequest {
  return { id, method: "test_method", params: [] };
}

describe("PluginService error handling", () => {
  it("RPC error triggers error tracking (no action on single error)", async () => {
    const store = make_store();
    const host_port = make_host_port();
    const notification = make_notification_port();
    const service = new PluginService(
      store as any,
      make_vault_store(),
      host_port,
      notification,
    );
    const rpc_handler = make_rpc_handler({ id: "req-1", error: "boom" });
    service.initialize_rpc({} as any);
    (service as any).rpc_handler = rpc_handler;

    const response = await service.handle_rpc("plugin-a", make_rpc_request());

    expect(response.error).toBe("boom");
    expect(notification.notify_plugin_unstable).not.toHaveBeenCalled();
    expect(notification.notify_plugin_auto_disabled).not.toHaveBeenCalled();
  });

  it("warn_user action calls notify_plugin_unstable after 2 errors within 5s", async () => {
    const store = make_store();
    const host_port = make_host_port();
    const notification = make_notification_port();
    const service = new PluginService(
      store as any,
      make_vault_store(),
      host_port,
      notification,
    );
    const rpc_handler = make_rpc_handler({ id: "req-1", error: "boom" });
    (service as any).rpc_handler = rpc_handler;

    const tracker = (service as any).error_tracker;
    // Pre-seed one error less than 5s ago
    tracker.record_error("plugin-a", Date.now() - 1_000);

    await service.handle_rpc("plugin-a", make_rpc_request());

    expect(notification.notify_plugin_unstable).toHaveBeenCalledWith(
      "plugin-a",
      "Plugin A",
    );
    expect(notification.notify_plugin_auto_disabled).not.toHaveBeenCalled();
  });

  it("auto_disable action disables the plugin and calls notify_plugin_auto_disabled", async () => {
    const store = make_store();
    const host_port = make_host_port();
    const notification = make_notification_port();
    const service = new PluginService(
      store as any,
      make_vault_store(),
      host_port,
      notification,
    );
    const rpc_handler = make_rpc_handler({ id: "req-1", error: "boom" });
    (service as any).rpc_handler = rpc_handler;

    const tracker = (service as any).error_tracker;
    const now = Date.now();
    tracker.record_error("plugin-a", now - 4_000);
    tracker.record_error("plugin-a", now - 3_000);
    tracker.record_error("plugin-a", now - 2_000);
    tracker.record_error("plugin-a", now - 1_000);

    await service.handle_rpc("plugin-a", make_rpc_request());

    expect(notification.notify_plugin_auto_disabled).toHaveBeenCalledWith(
      "plugin-a",
      "Plugin A",
    );
    expect(host_port.unload).toHaveBeenCalledWith("plugin-a");
    expect(store.plugins.get("plugin-a")?.status).toBe("idle");
    expect(store.plugins.get("plugin-a")?.enabled).toBe(false);
  });

  it("mark_plugin_crashed sets error status and removes contributions", async () => {
    const store = make_store();
    store.commands = [{ id: "plugin-a:cmd1" } as any];
    store.status_bar_items = [{ id: "plugin-a:bar1", priority: 1 } as any];
    store.sidebar_views = [{ id: "plugin-a:view1" } as any];

    const service = new PluginService(
      store as any,
      make_vault_store(),
      make_host_port(),
    );

    await service.mark_plugin_crashed("plugin-a", "iframe died");

    const info = store.plugins.get("plugin-a") as any;
    expect(info?.status).toBe("error");
    expect(info?.error).toBe("iframe died");
    expect(store.unregister_command).toHaveBeenCalledWith("plugin-a:cmd1");
    expect(store.unregister_status_bar_item).toHaveBeenCalledWith(
      "plugin-a:bar1",
    );
    expect(store.unregister_sidebar_view).toHaveBeenCalledWith(
      "plugin-a:view1",
    );
  });

  it("disabling a plugin resets its error tracker", async () => {
    const store = make_store();
    const host_port = make_host_port();
    const service = new PluginService(
      store as any,
      make_vault_store(),
      host_port,
    );
    const tracker = (service as any).error_tracker;
    const now = Date.now();
    tracker.record_error("plugin-a", now - 1_000);

    await service.disable_plugin("plugin-a");

    // After reset, a single error should return "none" (no prior history)
    const action = tracker.record_error("plugin-a", now);
    expect(action).toBe("none");
  });
});
