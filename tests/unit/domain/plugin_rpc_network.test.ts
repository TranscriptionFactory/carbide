import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginRpcHandler } from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginManifest } from "$lib/features/plugin/ports";

function make_manifest(
  overrides: Partial<PluginManifest> = {},
): PluginManifest {
  return {
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    author: "Test",
    description: "Test plugin",
    api_version: "1",
    permissions: ["network:fetch"],
    ...overrides,
  };
}

function make_context(network_fetch = vi.fn()) {
  return {
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
      plugin: {
        register_command: vi.fn(),
        unregister_command: vi.fn(),
        register_slash_command: vi.fn(),
        unregister_slash_command: vi.fn(),
        register_status_bar_item: vi.fn(),
        update_status_bar_item: vi.fn(),
        unregister_status_bar_item: vi.fn(),
        register_sidebar_view: vi.fn(),
        unregister_sidebar_view: vi.fn(),
        register_ribbon_icon: vi.fn(),
        unregister_ribbon_icon: vi.fn(),
        register_settings_tab: vi.fn(),
      },
    },
    stores: {
      notes: { notes: [] },
      editor: { open_note: null },
    },
    network: {
      fetch: network_fetch,
    },
  };
}

function make_settings_service(granted_permissions: string[]): {
  is_permission_granted: (id: string, perm: string) => boolean;
  get_setting: ReturnType<typeof vi.fn>;
  set_setting: ReturnType<typeof vi.fn>;
  get_all_settings: ReturnType<typeof vi.fn>;
} {
  return {
    is_permission_granted: (_id: string, perm: string) =>
      granted_permissions.includes(perm),
    get_setting: vi.fn(),
    set_setting: vi.fn(),
    get_all_settings: vi.fn(),
  };
}

describe("network.fetch RPC handler", () => {
  let fetch_mock: ReturnType<typeof vi.fn>;
  let handler: PluginRpcHandler;

  beforeEach(() => {
    fetch_mock = vi.fn().mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
      ok: true,
    });
    const context = make_context(fetch_mock);
    handler = new PluginRpcHandler(context);
    handler.set_settings_service(
      make_settings_service(["network:fetch"]) as never,
    );
  });

  it("dispatches a basic GET request", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      {
        id: "1",
        method: "network.fetch",
        params: ["https://api.example.com/data"],
      },
    );

    expect(response.error).toBeUndefined();
    expect(fetch_mock).toHaveBeenCalledWith({
      url: "https://api.example.com/data",
      method: "GET",
      headers: undefined,
      body: undefined,
    });
    expect(response.result).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      body: '{"ok":true}',
      ok: true,
    });
  });

  it("dispatches a POST request with body and headers", async () => {
    await handler.handle_request("test-plugin", make_manifest(), {
      id: "2",
      method: "network.fetch",
      params: [
        "https://api.example.com/submit",
        {
          method: "post",
          headers: { "Content-Type": "application/json" },
          body: '{"key":"value"}',
        },
      ],
    });

    expect(fetch_mock).toHaveBeenCalledWith({
      url: "https://api.example.com/submit",
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: '{"key":"value"}',
    });
  });

  it("rejects without network:fetch permission", async () => {
    handler.set_settings_service(make_settings_service([]) as never);

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest({ permissions: [] }),
      { id: "3", method: "network.fetch", params: ["https://example.com"] },
    );

    expect(response.error).toContain("Missing network:fetch permission");
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("rejects when origin is not in allowed_origins", async () => {
    const manifest = make_manifest({
      allowed_origins: ["https://api.allowed.com"],
    });

    const response = await handler.handle_request("test-plugin", manifest, {
      id: "4",
      method: "network.fetch",
      params: ["https://api.blocked.com/data"],
    });

    expect(response.error).toContain("not in this plugin's allowed_origins");
    expect(fetch_mock).not.toHaveBeenCalled();
  });

  it("allows origin that is in allowed_origins", async () => {
    const manifest = make_manifest({
      allowed_origins: ["https://api.allowed.com"],
    });

    await handler.handle_request("test-plugin", manifest, {
      id: "5",
      method: "network.fetch",
      params: ["https://api.allowed.com/v1/data"],
    });

    expect(fetch_mock).toHaveBeenCalled();
  });

  it("allows any origin when allowed_origins is not set", async () => {
    const manifest = make_manifest();

    await handler.handle_request("test-plugin", manifest, {
      id: "6",
      method: "network.fetch",
      params: ["https://any-domain.com/api"],
    });

    expect(fetch_mock).toHaveBeenCalled();
  });

  it("errors on unknown network action", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "7", method: "network.unknown", params: [] },
    );

    expect(response.error).toContain("Unknown network action");
  });

  it("errors when network backend is not initialized", async () => {
    const context = make_context();
    context.network = undefined as never;
    const handler2 = new PluginRpcHandler(context);
    handler2.set_settings_service(
      make_settings_service(["network:fetch"]) as never,
    );

    const response = await handler2.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "8", method: "network.fetch", params: ["https://example.com"] },
    );

    expect(response.error).toContain("Network backend not initialized");
  });

  it("validates URL parameter is a string", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "9", method: "network.fetch", params: [123] },
    );

    expect(response.error).toBeDefined();
    expect(fetch_mock).not.toHaveBeenCalled();
  });
});
