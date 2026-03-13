import { describe, expect, it, vi } from "vitest";
import { PluginService } from "$lib/features/plugin/application/plugin_service";
import { PluginStore } from "$lib/features/plugin/state/plugin_store.svelte";
import type {
  PluginHostPort,
  DiscoveredPlugin,
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

function create_harness() {
  const store = new PluginStore();
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  const host = create_mock_host();
  const service = new PluginService(store, vault_store, host);
  return { store, vault_store, host, service };
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
        manifest: {
          id: "my-plugin",
          name: "My Plugin",
          version: "1.0.0",
          author: "Test",
          description: "A test plugin",
          api_version: "1",
          permissions: [],
        },
        path: "/vault/.carbide/plugins/my-plugin",
      },
    ];
    vi.mocked(host.discover).mockResolvedValueOnce(discovered);

    await service.discover();

    expect(store.plugins.has("my-plugin")).toBe(true);
    expect(store.plugins.get("my-plugin")?.manifest.name).toBe("My Plugin");
  });

  it("enable_plugin sets status to active", async () => {
    const { service, store } = create_harness();
    store.plugins.set("p1", {
      manifest: {
        id: "p1",
        name: "P1",
        version: "1.0.0",
        author: "Test",
        description: "",
        api_version: "1",
        permissions: [],
      },
      path: "/vault/.carbide/plugins/p1",
      enabled: false,
      status: "idle",
    });

    await service.enable_plugin("p1");

    expect(store.plugins.get("p1")?.enabled).toBe(true);
    expect(store.plugins.get("p1")?.status).toBe("active");
  });

  it("disable_plugin sets status to idle", async () => {
    const { service, store } = create_harness();
    store.plugins.set("p1", {
      manifest: {
        id: "p1",
        name: "P1",
        version: "1.0.0",
        author: "Test",
        description: "",
        api_version: "1",
        permissions: [],
      },
      path: "/vault/.carbide/plugins/p1",
      enabled: true,
      status: "active",
    });

    await service.disable_plugin("p1");

    expect(store.plugins.get("p1")?.enabled).toBe(false);
    expect(store.plugins.get("p1")?.status).toBe("idle");
  });

  it("handle_rpc returns error when rpc_handler not initialized", async () => {
    const { service, store } = create_harness();
    store.plugins.set("p1", {
      manifest: {
        id: "p1",
        name: "P1",
        version: "1.0.0",
        author: "Test",
        description: "",
        api_version: "1",
        permissions: [],
      },
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
    const manifest = {
      id: "p1",
      name: "P1",
      version: "1.0.0",
      author: "Test",
      description: "",
      api_version: "1",
      permissions: ["fs:read"],
    };
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
    service.initialize_rpc({ services: {} as any, stores: {} as any });
    (service as any).rpc_handler = mock_handler;

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
      manifest: {
        id: "p1",
        name: "P1",
        version: "1.0.0",
        author: "A",
        description: "",
        api_version: "1",
        permissions: [],
      },
      path: "",
      enabled: true,
      status: "active",
    });
    store.plugins.set("p2", {
      manifest: {
        id: "p2",
        name: "P2",
        version: "1.0.0",
        author: "A",
        description: "",
        api_version: "1",
        permissions: [],
      },
      path: "",
      enabled: false,
      status: "idle",
    });
    store.plugins.set("p3", {
      manifest: {
        id: "p3",
        name: "P3",
        version: "1.0.0",
        author: "A",
        description: "",
        api_version: "1",
        permissions: [],
      },
      path: "",
      enabled: true,
      status: "error",
    });

    expect(store.active_plugin_ids).toEqual(["p1"]);
  });

  it("load and unload adapter are no-ops", async () => {
    const { host } = create_harness();
    await expect(host.load("any")).resolves.toBeUndefined();
    await expect(host.unload("any")).resolves.toBeUndefined();
  });
});
