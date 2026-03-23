import { describe, expect, it, vi } from "vitest";
import { PluginService } from "$lib/features/plugin/application/plugin_service";
import { PluginSettingsService } from "$lib/features/plugin/application/plugin_settings_service";
import { merge_plugin_settings_schema } from "$lib/features/plugin/application/plugin_settings_schema";
import { PluginStore } from "$lib/features/plugin/state/plugin_store.svelte";
import { PluginSettingsStore } from "$lib/features/plugin/state/plugin_settings_store.svelte";
import type {
  DiscoveredPlugin,
  PluginHostPort,
  PluginManifest,
  PluginSettingsPort,
} from "$lib/features/plugin/ports";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { create_test_vault } from "../helpers/test_fixtures";
import type { RpcRequest } from "$lib/features/plugin/application/plugin_rpc_handler";

function create_mock_host(): PluginHostPort {
  return {
    discover: vi.fn().mockResolvedValue([] as DiscoveredPlugin[]),
    load: vi.fn().mockResolvedValue(undefined),
    unload: vi.fn().mockResolvedValue(undefined),
  };
}

function create_mock_settings_port(): PluginSettingsPort {
  return {
    read_settings: vi
      .fn()
      .mockResolvedValue({ schema_version: 1, plugins: {} }),
    write_settings: vi.fn().mockResolvedValue(undefined),
    approve_permission: vi.fn().mockResolvedValue(undefined),
    deny_permission: vi.fn().mockResolvedValue(undefined),
  };
}

function make_manifest(overrides?: Partial<PluginManifest>): PluginManifest {
  return {
    id: "p1",
    name: "P1",
    version: "1.0.0",
    author: "Test",
    description: "",
    api_version: "1",
    permissions: [],
    ...overrides,
  };
}

function create_harness() {
  const store = new PluginStore();
  const settings_store = new PluginSettingsStore();
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const host = create_mock_host();
  const settings_port = create_mock_settings_port();
  const settings_service = new PluginSettingsService(
    settings_store,
    vault_store,
    settings_port,
  );
  const service = new PluginService(store, vault_store, host);
  service.set_settings_service(settings_service, settings_store);

  return {
    store,
    settings_store,
    vault_store,
    host,
    settings_port,
    settings_service,
    service,
  };
}

describe("PluginService", () => {
  it("discover returns empty list when host returns none", async () => {
    const { service } = create_harness();
    const result = await service.discover();
    expect(result).toEqual([]);
  });

  it("discover populates store from host results", async () => {
    const { service, store, host } = create_harness();
    const discovered: DiscoveredPlugin[] = [
      {
        manifest: make_manifest({ id: "my-plugin", name: "My Plugin" }),
        path: "/vault/.carbide/plugins/my-plugin",
      },
    ];
    vi.mocked(host.discover).mockResolvedValueOnce(discovered);

    await service.discover();

    expect(store.plugins.has("my-plugin")).toBe(true);
    expect(store.plugins.get("my-plugin")?.manifest.name).toBe("My Plugin");
  });

  it("discover merges persisted enabled state from plugin settings", async () => {
    const { service, store, settings_store, host } = create_harness();
    settings_store.set_entry("my-plugin", {
      enabled: true,
      version: "0.9.0",
      source: "local",
      permissions_granted: ["editor:read"],
      permissions_pending: [],
      settings: {},
      content_hash: null,
    });

    vi.mocked(host.discover).mockResolvedValueOnce([
      {
        manifest: make_manifest({
          id: "my-plugin",
          name: "My Plugin",
          version: "2.0.0",
          permissions: ["editor:read", "commands:register"],
        }),
        path: "/vault/.carbide/plugins/my-plugin",
      },
    ]);

    await service.discover();

    expect(store.plugins.get("my-plugin")?.enabled).toBe(true);
    expect(settings_store.get_entry("my-plugin")).toEqual({
      enabled: true,
      version: "2.0.0",
      source: "local",
      permissions_granted: ["editor:read"],
      permissions_pending: ["commands:register"],
      settings: {},
      content_hash: null,
    });
  });

  it("discover hydrates manifest defaults into plugin settings and persists them", async () => {
    const { service, settings_store, settings_port, host } = create_harness();
    vi.mocked(host.discover).mockResolvedValueOnce([
      {
        manifest: make_manifest({
          id: "auto-tag",
          name: "Auto Tag",
          permissions: ["editor:read"],
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
        }),
        path: "/vault/.carbide/plugins/auto-tag",
      },
    ]);

    await service.discover();

    expect(settings_store.get_entry("auto-tag")).toEqual({
      enabled: false,
      version: "1.0.0",
      source: "local",
      permissions_granted: [],
      permissions_pending: ["editor:read"],
      settings: { auto_tag_on_save: false },
      content_hash: null,
    });
    expect(settings_port.write_settings).toHaveBeenCalledOnce();
  });

  it("enable_plugin sets status to active and persists enabled state", async () => {
    const { service, store, settings_store, settings_port } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest({ permissions: ["editor:read"] }),
      path: "/vault/.carbide/plugins/p1",
      enabled: false,
      status: "idle",
    });

    await service.enable_plugin("p1");

    expect(store.plugins.get("p1")?.enabled).toBe(true);
    expect(store.plugins.get("p1")?.status).toBe("active");
    expect(settings_store.get_entry("p1")?.enabled).toBe(true);
    expect(settings_port.write_settings).toHaveBeenCalledOnce();
  });

  it("disable_plugin sets status to idle and persists disabled state", async () => {
    const { service, store, settings_store, settings_port } = create_harness();
    settings_store.set_entry("p1", {
      enabled: true,
      version: "1.0.0",
      source: "local",
      permissions_granted: [],
      permissions_pending: [],
      settings: {},
      content_hash: null,
    });
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    await service.disable_plugin("p1");

    expect(store.plugins.get("p1")?.enabled).toBe(false);
    expect(store.plugins.get("p1")?.status).toBe("idle");
    expect(settings_store.get_entry("p1")?.enabled).toBe(false);
    expect(settings_port.write_settings).toHaveBeenCalledOnce();
  });

  it("handle_rpc returns error when rpc_handler not initialized", async () => {
    const { service, store } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    const req: RpcRequest = { id: "r1", method: "vault.list", params: [] };
    const response = await service.handle_rpc("p1", req);

    expect(response.id).toBe("r1");
    expect(response.error).toBeDefined();
  });

  it("handle_rpc routes to rpc_handler when initialized", async () => {
    const { service, store } = create_harness();
    const manifest = make_manifest({ permissions: ["fs:read"] });
    store.plugins.set("p1", {
      manifest,
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    const mock_handler = {
      handle_request: vi
        .fn()
        .mockResolvedValue({ id: "r1", result: ["note.md"] }),
    };
    service.initialize_rpc({
      services: {
        note: {
          read_note: vi.fn(),
          create_note: vi.fn(),
          write_note: vi.fn(),
          delete_note: vi.fn(),
        },
        editor: {
          apply_ai_output: vi.fn(),
          get_ai_context: vi.fn(),
        },
        plugin: service,
      },
      stores: {
        notes: { notes: [] },
        editor: { open_note: null },
      },
    });
    const service_with_private = service as unknown as {
      rpc_handler: typeof mock_handler;
    };
    service_with_private.rpc_handler = mock_handler;

    const req: RpcRequest = { id: "r1", method: "vault.list", params: [] };
    const response = await service.handle_rpc("p1", req);

    expect(mock_handler.handle_request).toHaveBeenCalledWith(
      "p1",
      manifest,
      req,
    );
    expect(response.result).toEqual(["note.md"]);
  });

  it("active_plugin_ids only includes enabled active plugins", () => {
    const { store } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest({ id: "p1" }),
      path: "",
      enabled: true,
      status: "active",
    });
    store.plugins.set("p2", {
      manifest: make_manifest({ id: "p2", name: "P2" }),
      path: "",
      enabled: false,
      status: "idle",
    });
    store.plugins.set("p3", {
      manifest: make_manifest({ id: "p3", name: "P3" }),
      path: "",
      enabled: true,
      status: "error",
    });

    expect(store.active_plugin_ids).toEqual(["p1"]);
  });

  it("load calls backend with vault_path and plugin_id", async () => {
    const { service, host, vault_store } = create_harness();
    const vault = vault_store.vault;
    if (!vault) {
      throw new Error("Expected test vault");
    }

    await service.load_plugin("test-plugin");

    expect(host.load).toHaveBeenCalledWith(vault.path, "test-plugin");
  });

  it("unload calls backend with plugin_id", async () => {
    const { service, host, store } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    await service.unload_plugin("p1");

    expect(host.unload).toHaveBeenCalledWith("p1");
  });

  it("load_plugin throws when no active vault", async () => {
    const store = new PluginStore();
    const vault_store = new VaultStore();
    const host = create_mock_host();
    const service = new PluginService(store, vault_store, host);

    await expect(service.load_plugin("p1")).rejects.toThrow("No active vault");
  });

  it("reload_plugin unloads then reloads plugin", async () => {
    const { service, store, host } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    await service.reload_plugin("p1");

    expect(host.unload).toHaveBeenCalledWith("p1");
    expect(host.load).toHaveBeenCalled();
    expect(store.plugins.get("p1")?.status).toBe("active");
  });

  it("reload_plugin sets error status on failure", async () => {
    const { service, store, host } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });
    vi.mocked(host.load).mockRejectedValueOnce(new Error("manifest invalid"));

    await service.reload_plugin("p1");

    expect(store.plugins.get("p1")?.status).toBe("error");
    expect(store.plugins.get("p1")?.error).toBe("manifest invalid");
  });

  it("load_and_activate loads an enabled idle plugin", async () => {
    const { service, store } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "idle",
    });

    await service.load_and_activate("p1");

    expect(store.plugins.get("p1")?.status).toBe("active");
  });

  it("activate_matching loads enabled startup plugins only", async () => {
    const { service, store, host } = create_harness();
    store.plugins.set("startup", {
      manifest: make_manifest({
        id: "startup",
        name: "Startup",
        activation_events: ["on_startup"],
      }),
      path: "/vault/.carbide/plugins/startup",
      enabled: true,
      status: "idle",
    });
    store.plugins.set("settings-only", {
      manifest: make_manifest({
        id: "settings-only",
        name: "Settings Only",
        activation_events: ["on_settings_open"],
      }),
      path: "/vault/.carbide/plugins/settings-only",
      enabled: true,
      status: "idle",
    });
    store.plugins.set("disabled", {
      manifest: make_manifest({
        id: "disabled",
        name: "Disabled",
        activation_events: ["on_startup"],
      }),
      path: "/vault/.carbide/plugins/disabled",
      enabled: false,
      status: "idle",
    });

    await service.activate_matching("on_startup");

    expect(host.load).toHaveBeenCalledTimes(1);
    expect(host.load).toHaveBeenCalledWith("/test/vault", "startup");
    expect(store.plugins.get("startup")?.status).toBe("active");
    expect(store.plugins.get("settings-only")?.status).toBe("idle");
    expect(store.plugins.get("disabled")?.status).toBe("idle");
  });

  it("merge_plugin_settings_schema appends runtime settings without overriding manifest keys", () => {
    expect(
      merge_plugin_settings_schema(
        [
          {
            key: "folder",
            type: "string",
            label: "Folder",
            default: "daily/",
          },
        ],
        [
          {
            key: "folder",
            type: "string",
            label: "Runtime Folder",
            default: "runtime/",
          },
          {
            key: "show_reading_time",
            type: "boolean",
            label: "Show reading time",
            default: true,
          },
        ],
      ),
    ).toEqual([
      {
        key: "folder",
        type: "string",
        label: "Folder",
        default: "daily/",
      },
      {
        key: "show_reading_time",
        type: "boolean",
        label: "Show reading time",
        default: true,
      },
    ]);
  });

  it("can_open_settings returns true for enabled on_settings_open plugins with granted settings permission", () => {
    const { service, store, settings_store } = create_harness();
    settings_store.set_entry("settings-only", {
      enabled: true,
      version: "1.0.0",
      source: "local",
      permissions_granted: ["settings:register"],
      permissions_pending: [],
      settings: {},
      content_hash: null,
    });
    store.plugins.set("settings-only", {
      manifest: make_manifest({
        id: "settings-only",
        name: "Settings Only",
        permissions: ["settings:register"],
        activation_events: ["on_settings_open"],
      }),
      path: "/vault/.carbide/plugins/settings-only",
      enabled: true,
      status: "idle",
    });

    expect(service.can_open_settings("settings-only")).toBe(true);
  });

  it("can_open_settings returns false for runtime-only settings when settings permission is pending", () => {
    const { service, store, settings_store } = create_harness();
    settings_store.set_entry("settings-only", {
      enabled: true,
      version: "1.0.0",
      source: "local",
      permissions_granted: [],
      permissions_pending: ["settings:register"],
      settings: {},
      content_hash: null,
    });
    store.plugins.set("settings-only", {
      manifest: make_manifest({
        id: "settings-only",
        name: "Settings Only",
        permissions: ["settings:register"],
        activation_events: ["on_settings_open"],
      }),
      path: "/vault/.carbide/plugins/settings-only",
      enabled: true,
      status: "idle",
    });

    expect(service.can_open_settings("settings-only")).toBe(false);
  });

  it("ensure_settings_ready activates enabled on_settings_open plugins when settings permission is granted", async () => {
    const { service, store, host, settings_store } = create_harness();
    settings_store.set_entry("settings-only", {
      enabled: true,
      version: "1.0.0",
      source: "local",
      permissions_granted: ["settings:register"],
      permissions_pending: [],
      settings: {},
      content_hash: null,
    });
    store.plugins.set("settings-only", {
      manifest: make_manifest({
        id: "settings-only",
        name: "Settings Only",
        permissions: ["settings:register"],
        activation_events: ["on_settings_open"],
      }),
      path: "/vault/.carbide/plugins/settings-only",
      enabled: true,
      status: "idle",
    });

    await service.ensure_settings_ready("settings-only");

    expect(host.load).toHaveBeenCalledWith("/test/vault", "settings-only");
    expect(store.plugins.get("settings-only")?.status).toBe("active");
  });

  it("ensure_settings_ready skips activation when settings permission is pending", async () => {
    const { service, store, host, settings_store } = create_harness();
    settings_store.set_entry("settings-only", {
      enabled: true,
      version: "1.0.0",
      source: "local",
      permissions_granted: [],
      permissions_pending: ["settings:register"],
      settings: {},
      content_hash: null,
    });
    store.plugins.set("settings-only", {
      manifest: make_manifest({
        id: "settings-only",
        name: "Settings Only",
        permissions: ["settings:register"],
        activation_events: ["on_settings_open"],
      }),
      path: "/vault/.carbide/plugins/settings-only",
      enabled: true,
      status: "idle",
    });

    await service.ensure_settings_ready("settings-only");

    expect(host.load).not.toHaveBeenCalled();
    expect(store.plugins.get("settings-only")?.status).toBe("idle");
  });

  it("load_and_activate skips disabled plugins", async () => {
    const { service, store, host } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: false,
      status: "idle",
    });

    await service.load_and_activate("p1");

    expect(host.load).not.toHaveBeenCalled();
    expect(store.plugins.get("p1")?.status).toBe("idle");
  });

  it("unload_then_idle transitions active plugin to idle", async () => {
    const { service, store, host } = create_harness();
    store.plugins.set("p1", {
      manifest: make_manifest(),
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    await service.unload_then_idle("p1");

    expect(host.unload).toHaveBeenCalledWith("p1");
    expect(store.plugins.get("p1")?.status).toBe("idle");
    expect(store.plugins.get("p1")?.enabled).toBe(true);
  });

  it("clear_vault_state unloads non-idle plugins and clears discovered plugins", async () => {
    const { service, store, host } = create_harness();
    store.plugins.set("active", {
      manifest: make_manifest({ id: "active", name: "Active" }),
      path: "/vault/.carbide/plugins/active",
      enabled: true,
      status: "active",
    });
    store.plugins.set("error", {
      manifest: make_manifest({ id: "error", name: "Error" }),
      path: "/vault/.carbide/plugins/error",
      enabled: true,
      status: "error",
    });
    store.plugins.set("idle", {
      manifest: make_manifest({ id: "idle", name: "Idle" }),
      path: "/vault/.carbide/plugins/idle",
      enabled: false,
      status: "idle",
    });

    await service.clear_vault_state();

    expect(host.unload).toHaveBeenCalledTimes(2);
    expect(host.unload).toHaveBeenNthCalledWith(1, "active");
    expect(host.unload).toHaveBeenNthCalledWith(2, "error");
    expect(store.plugins.size).toBe(0);
  });
});
