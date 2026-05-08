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
    permissions: ["actions:execute"],
    ...overrides,
  };
}

function make_context(actions_backend?: {
  list: ReturnType<typeof vi.fn>;
  available: ReturnType<typeof vi.fn>;
  execute: ReturnType<typeof vi.fn>;
}) {
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
    actions: actions_backend,
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

function make_actions_backend() {
  return {
    list: vi.fn().mockReturnValue([
      { id: "open-note", label: "Open Note", shortcut: "Ctrl+O" },
      { id: "save-note", label: "Save Note" },
    ]),
    available: vi
      .fn()
      .mockReturnValue([
        { id: "open-note", label: "Open Note", shortcut: "Ctrl+O" },
      ]),
    execute: vi.fn().mockResolvedValue(undefined),
  };
}

describe("actions RPC handler", () => {
  let backend: ReturnType<typeof make_actions_backend>;
  let handler: PluginRpcHandler;

  beforeEach(() => {
    backend = make_actions_backend();
    const context = make_context(backend);
    handler = new PluginRpcHandler(context as never);
    handler.set_settings_service(
      make_settings_service(["actions:execute"]) as never,
    );
  });

  it("list returns action summaries when permission granted", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "1", method: "actions.list", params: [] },
    );

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual([
      { id: "open-note", label: "Open Note", shortcut: "Ctrl+O" },
      { id: "save-note", label: "Save Note" },
    ]);
    expect(backend.list).toHaveBeenCalled();
  });

  it("available returns filtered action summaries when permission granted", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "2", method: "actions.available", params: [] },
    );

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual([
      { id: "open-note", label: "Open Note", shortcut: "Ctrl+O" },
    ]);
    expect(backend.available).toHaveBeenCalled();
  });

  it("execute dispatches to backend when permission granted", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "3", method: "actions.execute", params: ["open-note", ["arg1"]] },
    );

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ success: true });
    expect(backend.execute).toHaveBeenCalledWith("open-note", ["arg1"]);
  });

  it("execute works without args", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "4", method: "actions.execute", params: ["open-note"] },
    );

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({ success: true });
    expect(backend.execute).toHaveBeenCalledWith("open-note", []);
  });

  it("list rejects when actions:execute permission not granted", async () => {
    handler.set_settings_service(make_settings_service([]) as never);

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest({ permissions: [] }),
      { id: "5", method: "actions.list", params: [] },
    );

    expect(response.error).toContain("Missing actions:execute permission");
    expect(backend.list).not.toHaveBeenCalled();
  });

  it("available rejects when actions:execute permission not granted", async () => {
    handler.set_settings_service(make_settings_service([]) as never);

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest({ permissions: [] }),
      { id: "6", method: "actions.available", params: [] },
    );

    expect(response.error).toContain("Missing actions:execute permission");
    expect(backend.available).not.toHaveBeenCalled();
  });

  it("execute rejects when actions:execute permission not granted", async () => {
    handler.set_settings_service(make_settings_service([]) as never);

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest({ permissions: [] }),
      { id: "7", method: "actions.execute", params: ["open-note"] },
    );

    expect(response.error).toContain("Missing actions:execute permission");
    expect(backend.execute).not.toHaveBeenCalled();
  });

  it("execute throws on invalid action_id (non-string)", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "8", method: "actions.execute", params: [123] },
    );

    expect(response.error).toBeDefined();
    expect(backend.execute).not.toHaveBeenCalled();
  });

  it("execute propagates errors from backend", async () => {
    backend.execute.mockRejectedValue(new Error("Unknown action: bad-id"));

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "9", method: "actions.execute", params: ["bad-id"] },
    );

    expect(response.error).toContain("Unknown action: bad-id");
  });

  it("errors when actions backend is not initialized", async () => {
    const context = make_context(undefined);
    const handler2 = new PluginRpcHandler(context as never);
    handler2.set_settings_service(
      make_settings_service(["actions:execute"]) as never,
    );

    const response = await handler2.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "10", method: "actions.list", params: [] },
    );

    expect(response.error).toContain("Actions backend not initialized");
  });

  it("errors on unknown actions action", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "11", method: "actions.unknown", params: [] },
    );

    expect(response.error).toContain("Unknown actions action");
  });
});
