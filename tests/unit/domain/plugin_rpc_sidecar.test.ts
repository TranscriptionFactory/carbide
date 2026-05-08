import { describe, it, expect, vi, beforeEach } from "vitest";
import { PluginRpcHandler } from "$lib/features/plugin/application/plugin_rpc_handler";
import type { PluginManifest } from "$lib/features/plugin/ports";
import type { ExternalMcpAdapter } from "$lib/features/plugin/adapters/external_mcp_tauri_adapter";

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
    permissions: ["sidecar:access"],
    ...overrides,
  };
}

function make_sidecar_mock(): {
  [K in keyof ExternalMcpAdapter]: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    call_tool: vi
      .fn()
      .mockResolvedValue({ content: [{ type: "text", text: "ok" }] }),
    status: vi
      .fn()
      .mockResolvedValue({ status: "running", tool_count: 5 }),
  };
}

function make_context(sidecar: ExternalMcpAdapter) {
  return {
    services: {
      note: {
        read_note: vi.fn(),
        create_note: vi.fn(),
        write_note: vi.fn(),
        delete_note: vi.fn(),
        read_asset: vi.fn(),
        list_notes: vi.fn(),
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
      tab: { active_tab: null },
      vault: { vault: { path: "/test/vault" } },
    },
    sidecar,
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

describe("sidecar.* RPC handler", () => {
  let sidecar: ReturnType<typeof make_sidecar_mock>;
  let handler: PluginRpcHandler;
  const manifest = make_manifest();

  beforeEach(() => {
    sidecar = make_sidecar_mock();
    handler = new PluginRpcHandler(make_context(sidecar));
    handler.set_settings_service(
      make_settings_service(["sidecar:access"]) as never,
    );
  });

  describe("start", () => {
    it("namespaces server_id with plugin_id", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        {
          id: "1",
          method: "sidecar.start",
          params: ["my-server", "/usr/bin/mcp-server", ["--arg"], { KEY: "val" }, "/tmp"],
        },
      );

      expect(response.error).toBeUndefined();
      expect(sidecar.start).toHaveBeenCalledWith(
        "test-plugin:my-server",
        "/usr/bin/mcp-server",
        ["--arg"],
        { KEY: "val" },
        "/tmp",
      );
    });

    it("handles missing optional args", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        {
          id: "2",
          method: "sidecar.start",
          params: ["srv", "/bin/tool"],
        },
      );

      expect(response.error).toBeUndefined();
      expect(sidecar.start).toHaveBeenCalledWith(
        "test-plugin:srv",
        "/bin/tool",
        [],
        {},
        undefined,
      );
    });
  });

  describe("stop", () => {
    it("stops with namespaced server_id", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        { id: "3", method: "sidecar.stop", params: ["my-server"] },
      );

      expect(response.error).toBeUndefined();
      expect(sidecar.stop).toHaveBeenCalledWith("test-plugin:my-server");
    });
  });

  describe("call_tool", () => {
    it("forwards tool call with namespaced server_id", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        {
          id: "4",
          method: "sidecar.call_tool",
          params: ["srv", "compile_wiki", { output: "wiki/" }],
        },
      );

      expect(response.error).toBeUndefined();
      expect(sidecar.call_tool).toHaveBeenCalledWith(
        "test-plugin:srv",
        "compile_wiki",
        { output: "wiki/" },
      );
      expect(response.result).toEqual({
        content: [{ type: "text", text: "ok" }],
      });
    });

    it("handles call_tool without arguments", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        {
          id: "5",
          method: "sidecar.call_tool",
          params: ["srv", "status"],
        },
      );

      expect(response.error).toBeUndefined();
      expect(sidecar.call_tool).toHaveBeenCalledWith(
        "test-plugin:srv",
        "status",
        undefined,
      );
    });
  });

  describe("status", () => {
    it("returns status with namespaced server_id", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        { id: "6", method: "sidecar.status", params: ["srv"] },
      );

      expect(response.error).toBeUndefined();
      expect(sidecar.status).toHaveBeenCalledWith("test-plugin:srv");
      expect(response.result).toEqual({
        status: "running",
        tool_count: 5,
      });
    });
  });

  describe("permissions", () => {
    it("rejects without sidecar:access permission", async () => {
      handler.set_settings_service(make_settings_service([]) as never);

      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        { id: "7", method: "sidecar.start", params: ["srv", "/bin/tool"] },
      );

      expect(response.error).toContain("Missing sidecar:access permission");
      expect(sidecar.start).not.toHaveBeenCalled();
    });
  });

  describe("errors", () => {
    it("errors on unknown sidecar action", async () => {
      const response = await handler.handle_request(
        "test-plugin",
        manifest,
        { id: "8", method: "sidecar.unknown", params: [] },
      );

      expect(response.error).toContain("Unknown sidecar action");
    });

    it("errors when sidecar backend is not initialized", async () => {
      const context = make_context(sidecar);
      context.sidecar = undefined as never;
      const handler2 = new PluginRpcHandler(context);
      handler2.set_settings_service(
        make_settings_service(["sidecar:access"]) as never,
      );

      const response = await handler2.handle_request(
        "test-plugin",
        manifest,
        { id: "9", method: "sidecar.start", params: ["srv", "/bin/tool"] },
      );

      expect(response.error).toContain("Sidecar backend not initialized");
    });
  });

  describe("plugin isolation", () => {
    it("different plugins get different server namespaces", async () => {
      await handler.handle_request("plugin-a", manifest, {
        id: "10",
        method: "sidecar.status",
        params: ["shared-name"],
      });

      await handler.handle_request("plugin-b", manifest, {
        id: "11",
        method: "sidecar.status",
        params: ["shared-name"],
      });

      expect(sidecar.status).toHaveBeenCalledWith("plugin-a:shared-name");
      expect(sidecar.status).toHaveBeenCalledWith("plugin-b:shared-name");
    });
  });
});
