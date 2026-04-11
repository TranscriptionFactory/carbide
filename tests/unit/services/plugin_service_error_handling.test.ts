import { describe, expect, it, vi } from "vitest";
import { PluginService } from "$lib/features/plugin/application/plugin_service";
import { PluginErrorTracker } from "$lib/features/plugin/application/plugin_error_tracker";
import type {
  PluginHostPort,
  PluginInfo,
  PluginNotificationPort,
  StatusBarItem,
  SidebarView,
  RibbonIcon,
  PluginSettingsTab,
} from "$lib/features/plugin/ports";
import type {
  RpcRequest,
  RpcResponse,
} from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginStore } from "$lib/features/plugin/state/plugin_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { CommandDefinition } from "$lib/features/search";

type TestStore = {
  plugins: Map<string, PluginInfo>;
  commands: CommandDefinition[];
  slash_commands: Array<{ id: string; plugin_id: string }>;
  status_bar_items: StatusBarItem[];
  sidebar_views: SidebarView[];
  ribbon_icons: RibbonIcon[];
  settings_tabs: PluginSettingsTab[];
  register_command: ReturnType<typeof vi.fn>;
  unregister_command: ReturnType<typeof vi.fn>;
  register_slash_command: ReturnType<typeof vi.fn>;
  unregister_slash_command: ReturnType<typeof vi.fn>;
  register_status_bar_item: ReturnType<typeof vi.fn>;
  unregister_status_bar_item: ReturnType<typeof vi.fn>;
  update_status_bar_item: ReturnType<typeof vi.fn>;
  register_sidebar_view: ReturnType<typeof vi.fn>;
  unregister_sidebar_view: ReturnType<typeof vi.fn>;
  register_ribbon_icon: ReturnType<typeof vi.fn>;
  unregister_ribbon_icon: ReturnType<typeof vi.fn>;
  register_settings_tab: ReturnType<typeof vi.fn>;
  unregister_settings_tab: ReturnType<typeof vi.fn>;
};

type TestRpcHandler = {
  handle_request: ReturnType<typeof vi.fn>;
};

type PluginServiceInternals = {
  rpc_handler: TestRpcHandler | null;
  error_tracker: PluginErrorTracker;
};

function plugin_service_internals(
  service: PluginService,
): PluginServiceInternals {
  return service as unknown as PluginServiceInternals;
}

function make_manifest(
  id = "plugin-a",
  name = "Plugin A",
): PluginInfo["manifest"] {
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

function make_store(plugin_id = "plugin-a"): TestStore {
  const manifest = make_manifest(plugin_id);
  const plugins = new Map<string, PluginInfo>([
    [
      plugin_id,
      {
        manifest,
        path: "/plugins/a",
        enabled: true,
        status: "active",
      },
    ],
  ]);

  return {
    plugins,
    commands: [],
    slash_commands: [],
    status_bar_items: [],
    sidebar_views: [],
    ribbon_icons: [],
    settings_tabs: [],
    register_command: vi.fn(),
    unregister_command: vi.fn(),
    register_slash_command: vi.fn(),
    unregister_slash_command: vi.fn(),
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
  const unload = vi.fn().mockResolvedValue(undefined);

  return {
    port: {
      discover: vi.fn().mockResolvedValue([]),
      load: vi.fn().mockResolvedValue(undefined),
      unload,
      watch: vi.fn().mockResolvedValue(undefined),
      unwatch: vi.fn().mockResolvedValue(undefined),
      subscribe_plugin_changes: vi.fn().mockReturnValue(() => {}),
    } satisfies PluginHostPort,
    mocks: { unload },
  };
}

function make_vault_store(): VaultStore {
  return { vault: { path: "/vault" } } as unknown as VaultStore;
}

function make_rpc_handler(response: RpcResponse): TestRpcHandler {
  return {
    handle_request: vi.fn().mockResolvedValue(response),
  };
}

function make_notification_port() {
  const notify_plugin_unstable = vi.fn();
  const notify_plugin_auto_disabled = vi.fn();

  return {
    port: {
      notify_plugin_unstable,
      notify_plugin_auto_disabled,
    } satisfies PluginNotificationPort,
    mocks: {
      notify_plugin_unstable,
      notify_plugin_auto_disabled,
    },
  };
}

function make_rpc_request(id = "req-1"): RpcRequest {
  return { id, method: "test_method", params: [] };
}

function create_service(input?: {
  store?: TestStore;
  notification_port?: PluginNotificationPort;
}) {
  const store = input?.store ?? make_store();
  const host_port = make_host_port();
  const service = new PluginService(
    store as unknown as PluginStore,
    make_vault_store(),
    host_port.port,
    input?.notification_port,
  );

  return { service, store, host_port };
}

describe("PluginService error handling", () => {
  it("RPC error triggers error tracking (no action on single error)", async () => {
    const notification = make_notification_port();
    const { service } = create_service({
      notification_port: notification.port,
    });
    plugin_service_internals(service).rpc_handler = make_rpc_handler({
      id: "req-1",
      error: "boom",
    });

    const response = await service.handle_rpc("plugin-a", make_rpc_request());

    expect(response.error).toBe("boom");
    expect(notification.mocks.notify_plugin_unstable).not.toHaveBeenCalled();
    expect(
      notification.mocks.notify_plugin_auto_disabled,
    ).not.toHaveBeenCalled();
  });

  it("warn_user action calls notify_plugin_unstable after 2 errors within 5s", async () => {
    const notification = make_notification_port();
    const { service } = create_service({
      notification_port: notification.port,
    });
    const internals = plugin_service_internals(service);
    internals.rpc_handler = make_rpc_handler({ id: "req-1", error: "boom" });
    internals.error_tracker.record_error("plugin-a", Date.now() - 1_000);

    await service.handle_rpc("plugin-a", make_rpc_request());

    expect(notification.mocks.notify_plugin_unstable).toHaveBeenCalledWith(
      "plugin-a",
      "Plugin A",
    );
    expect(
      notification.mocks.notify_plugin_auto_disabled,
    ).not.toHaveBeenCalled();
  });

  it("auto_disable action disables the plugin and calls notify_plugin_auto_disabled", async () => {
    const notification = make_notification_port();
    const { service, store, host_port } = create_service({
      notification_port: notification.port,
    });
    const internals = plugin_service_internals(service);
    internals.rpc_handler = make_rpc_handler({ id: "req-1", error: "boom" });

    const now = Date.now();
    internals.error_tracker.record_error("plugin-a", now - 4_000);
    internals.error_tracker.record_error("plugin-a", now - 3_000);
    internals.error_tracker.record_error("plugin-a", now - 2_000);
    internals.error_tracker.record_error("plugin-a", now - 1_000);

    await service.handle_rpc("plugin-a", make_rpc_request());

    expect(notification.mocks.notify_plugin_auto_disabled).toHaveBeenCalledWith(
      "plugin-a",
      "Plugin A",
    );
    expect(host_port.mocks.unload).toHaveBeenCalledWith("plugin-a");
    expect(store.plugins.get("plugin-a")?.status).toBe("idle");
    expect(store.plugins.get("plugin-a")?.enabled).toBe(false);
  });

  it("mark_plugin_crashed sets error status and removes contributions", () => {
    const store = make_store();
    store.commands = [{ id: "plugin-a:cmd1" } as CommandDefinition];
    store.status_bar_items = [
      { id: "plugin-a:bar1", priority: 1 } as StatusBarItem,
    ];
    store.sidebar_views = [{ id: "plugin-a:view1" } as SidebarView];

    const { service } = create_service({ store });

    service.mark_plugin_crashed("plugin-a", "iframe died");

    const info = store.plugins.get("plugin-a");
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
    const { service } = create_service();
    const tracker = plugin_service_internals(service).error_tracker;
    const now = Date.now();
    tracker.record_error("plugin-a", now - 1_000);

    await service.disable_plugin("plugin-a");

    const action = tracker.record_error("plugin-a", now);
    expect(action).toBe("none");
  });
});
