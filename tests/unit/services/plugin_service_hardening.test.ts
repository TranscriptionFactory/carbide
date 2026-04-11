import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginService } from "$lib/features/plugin/application/plugin_service";
import { PluginErrorTracker } from "$lib/features/plugin/application/plugin_error_tracker";
import { PluginRateLimiter } from "$lib/features/plugin/domain/rate_limiter";
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
  rate_limiter: PluginRateLimiter;
};

function plugin_service_internals(
  service: PluginService,
): PluginServiceInternals {
  return service as unknown as PluginServiceInternals;
}

function make_store(plugin_id = "plugin-a"): TestStore {
  const manifest = {
    id: plugin_id,
    name: "Plugin A",
    version: "1.0.0",
    author: "test",
    description: "",
    api_version: "1",
    permissions: [],
  };
  const plugins = new Map<string, PluginInfo>([
    [
      plugin_id,
      { manifest, path: "/plugins/a", enabled: true, status: "active" },
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

function make_vault_store(): VaultStore {
  return { vault: { path: "/vault" } } as unknown as VaultStore;
}

function make_notification_port(): PluginNotificationPort {
  return {
    notify_plugin_unstable: vi.fn(),
    notify_plugin_auto_disabled: vi.fn(),
  };
}

function make_rpc_request(method = "editor.get_value"): RpcRequest {
  return { id: "req-1", method, params: [] };
}

function create_service() {
  const store = make_store();
  const notification = make_notification_port();
  const service = new PluginService(
    store as unknown as PluginStore,
    make_vault_store(),
    make_host_port(),
    notification,
  );
  return { service, store, notification };
}

describe("PluginService RPC hardening", () => {
  describe("rate limiting", () => {
    it("rejects with rate limit error when budget exceeded", async () => {
      const { service } = create_service();
      const internals = plugin_service_internals(service);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockResolvedValue({ id: "req-1", result: "ok" }),
      };
      internals.rate_limiter = new PluginRateLimiter(2, 60_000);

      await service.handle_rpc("plugin-a", make_rpc_request());
      await service.handle_rpc("plugin-a", make_rpc_request());
      const response = await service.handle_rpc("plugin-a", make_rpc_request());

      expect(response.error).toContain("exceeded rate limit");
      expect(internals.rpc_handler.handle_request).toHaveBeenCalledTimes(2);
    });

    it("rate limiter resets on clear_active_vault", async () => {
      const { service } = create_service();
      const internals = plugin_service_internals(service);
      internals.rate_limiter = new PluginRateLimiter(1, 60_000);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockResolvedValue({ id: "req-1", result: "ok" }),
      };

      await service.handle_rpc("plugin-a", make_rpc_request());
      await service.clear_active_vault();

      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockResolvedValue({ id: "req-1", result: "ok" }),
      };
      const store = make_store();
      (service as unknown as { store: TestStore }).store = store;

      const limiter = internals.rate_limiter;
      expect(() => limiter.check("plugin-a")).not.toThrow();
    });
  });

  describe("timeout", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("returns timeout error when RPC handler takes too long", async () => {
      const { service } = create_service();
      const internals = plugin_service_internals(service);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockImplementation(
            () => new Promise((resolve) => setTimeout(resolve, 10_000)),
          ),
      };

      const rpc_promise = service.handle_rpc("plugin-a", {
        id: "req-1",
        method: "editor.get_value",
        params: [],
      });

      await vi.advanceTimersByTimeAsync(5_001);
      const response = await rpc_promise;

      expect(response.error).toContain("timed out");
    });
  });

  describe("success tracking", () => {
    it("records success on non-error response", async () => {
      const { service } = create_service();
      const internals = plugin_service_internals(service);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockResolvedValue({ id: "req-1", result: "ok" }),
      };

      internals.error_tracker.record_error("plugin-a", Date.now());
      expect(internals.error_tracker.get_consecutive_errors("plugin-a")).toBe(
        1,
      );

      await service.handle_rpc("plugin-a", make_rpc_request());

      expect(internals.error_tracker.get_consecutive_errors("plugin-a")).toBe(
        0,
      );
    });

    it("does not record success on error response", async () => {
      const { service } = create_service();
      const internals = plugin_service_internals(service);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockResolvedValue({ id: "req-1", error: "bad" }),
      };

      await service.handle_rpc("plugin-a", make_rpc_request());

      expect(internals.error_tracker.get_consecutive_errors("plugin-a")).toBe(
        1,
      );
    });
  });

  describe("consecutive error auto-disable", () => {
    it("auto-disables plugin after 10 consecutive errors", async () => {
      const { service, notification } = create_service();
      const internals = plugin_service_internals(service);
      internals.rpc_handler = {
        handle_request: vi
          .fn()
          .mockResolvedValue({ id: "req-1", error: "fail" }),
      };

      for (let i = 0; i < 9; i++) {
        await service.handle_rpc("plugin-a", make_rpc_request());
      }

      const response = await service.handle_rpc("plugin-a", make_rpc_request());

      expect(response.error).toBe("fail");
      expect(notification.notify_plugin_auto_disabled).toHaveBeenCalledWith(
        "plugin-a",
        "Plugin A",
      );
    });
  });
});
