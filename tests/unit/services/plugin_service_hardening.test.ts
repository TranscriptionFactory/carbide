import { describe, expect, it, vi } from "vitest";
import { PluginService } from "$lib/features/plugin/application/plugin_service";
import { PluginErrorTracker } from "$lib/features/plugin/application/plugin_error_tracker";
import { PluginRateLimiter } from "$lib/features/plugin/domain/rate_limiter";
import type {
  PluginHostPort,
  PluginInfo,
  PluginNotificationPort,
} from "$lib/features/plugin/ports";
import type {
  RpcRequest,
  RpcResponse,
} from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginStore } from "$lib/features/plugin/state/plugin_store.svelte";
import type { VaultStore } from "$lib/features/vault";

type TestRpcHandler = {
  handle_request: ReturnType<typeof vi.fn>;
};

type PluginServiceInternals = {
  rpc_handler: TestRpcHandler | null;
  error_tracker: PluginErrorTracker;
  rate_limiter: PluginRateLimiter;
};

function plugin_service_internals(
  service: PluginService,
): PluginServiceInternals {
  return service as unknown as PluginServiceInternals;
}

function make_manifest(id = "plugin-a"): PluginInfo["manifest"] {
  return {
    id,
    name: "Plugin A",
    version: "1.0.0",
    author: "test",
    description: "",
    api_version: "1",
    permissions: [],
  };
}

function make_store(plugin_id = "plugin-a") {
  const plugins = new Map<string, PluginInfo>([
    [
      plugin_id,
      {
        manifest: make_manifest(plugin_id),
        path: "/plugins/a",
        enabled: true,
        status: "active",
      },
    ],
  ]);

  return {
    plugins,
    commands: [],
    status_bar_items: [],
    sidebar_views: [],
    ribbon_icons: [],
    settings_tabs: [],
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

function make_host_port(): PluginHostPort {
  return {
    discover: vi.fn().mockResolvedValue([]),
    load: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(undefined),
    watch: vi.fn().mockResolvedValue(undefined),
    unwatch: vi.fn().mockResolvedValue(undefined),
    subscribe_plugin_changes: vi.fn().mockReturnValue(() => {}),
  };
}

function make_rpc_request(id = "req-1", method = "test.method"): RpcRequest {
  return { id, method, params: [] };
}

function create_service(opts?: { notification?: PluginNotificationPort }) {
  const store = make_store();
  const host_port = make_host_port();
  const service = new PluginService(
    store as unknown as PluginStore,
    { vault: { path: "/vault" } } as unknown as VaultStore,
    host_port,
    opts?.notification,
  );
  return { service, store, host_port };
}

describe("PluginService rate limiting", () => {
  it("returns rate limit error when limit exceeded", async () => {
    const { service } = create_service();
    const internals = plugin_service_internals(service);
    internals.rpc_handler = {
      handle_request: vi.fn().mockResolvedValue({ id: "req-1", result: "ok" }),
    };

    internals.rate_limiter = new PluginRateLimiter(2, 60_000);
    await service.handle_rpc("plugin-a", make_rpc_request());
    await service.handle_rpc("plugin-a", make_rpc_request("req-2"));

    const response = await service.handle_rpc(
      "plugin-a",
      make_rpc_request("req-3"),
    );
    expect(response.error).toContain("Rate limit exceeded");
    expect(internals.rpc_handler.handle_request).toHaveBeenCalledTimes(2);
  });
});

describe("PluginService RPC timeout", () => {
  it("returns timeout error when RPC handler takes too long", async () => {
    vi.useFakeTimers();
    try {
      const { service } = create_service();
      const internals = plugin_service_internals(service);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 60_000)),
          ),
      };

      const promise = service.handle_rpc(
        "plugin-a",
        make_rpc_request("req-1", "editor.get_value"),
      );

      await vi.advanceTimersByTimeAsync(5_001);
      const response = await promise;

      expect(response.error).toContain("timed out");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PluginService consecutive error budget", () => {
  it("record_success resets consecutive counter via handle_rpc", async () => {
    const { service } = create_service();
    const internals = plugin_service_internals(service);
    internals.rpc_handler = {
      handle_request: vi.fn().mockResolvedValue({ id: "req-1", result: "ok" }),
    };

    internals.error_tracker.record_error("plugin-a", Date.now());
    internals.error_tracker.record_error("plugin-a", Date.now());

    await service.handle_rpc("plugin-a", make_rpc_request());
    expect(internals.error_tracker.get_consecutive_errors("plugin-a")).toBe(0);
  });
});

describe("PluginService lifecycle hooks", () => {
  it("notify_settings_changed sends lifecycle message to iframe", () => {
    const { service } = create_service();
    const post_message = vi.fn();
    service.register_iframe_messenger("plugin-a", post_message);

    service.notify_settings_changed("plugin-a", { theme: "dark" });

    expect(post_message).toHaveBeenCalledWith({
      type: "lifecycle",
      hook: "on_settings_change",
      context: { changed: { theme: "dark" } },
    });
  });

  it("notify_settings_changed is no-op when no messenger registered", () => {
    const { service } = create_service();
    expect(() => {
      service.notify_settings_changed("plugin-a", { theme: "dark" });
    }).not.toThrow();
  });
});
