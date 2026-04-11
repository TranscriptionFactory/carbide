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
    permissions: ["ai:execute"],
    ...overrides,
  };
}

function make_context(ai_execute = vi.fn()) {
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
    ai: {
      execute: ai_execute,
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

describe("ai.execute RPC handler", () => {
  let execute_mock: ReturnType<typeof vi.fn>;
  let handler: PluginRpcHandler;

  beforeEach(() => {
    execute_mock = vi.fn().mockResolvedValue({
      success: true,
      output: "AI response text",
      error: null,
    });
    const context = make_context(execute_mock);
    handler = new PluginRpcHandler(context);
    handler.set_settings_service(
      make_settings_service(["ai:execute"]) as never,
    );
  });

  it("executes with prompt and default mode", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      {
        id: "1",
        method: "ai.execute",
        params: [{ prompt: "Summarize this note" }],
      },
    );

    expect(response.error).toBeUndefined();
    expect(execute_mock).toHaveBeenCalledWith({
      prompt: "Summarize this note",
      mode: "ask",
    });
    expect(response.result).toEqual({
      success: true,
      output: "AI response text",
      error: null,
    });
  });

  it("executes with explicit edit mode", async () => {
    await handler.handle_request("test-plugin", make_manifest(), {
      id: "2",
      method: "ai.execute",
      params: [{ prompt: "Fix grammar", mode: "edit" }],
    });

    expect(execute_mock).toHaveBeenCalledWith({
      prompt: "Fix grammar",
      mode: "edit",
    });
  });

  it("executes with explicit ask mode", async () => {
    await handler.handle_request("test-plugin", make_manifest(), {
      id: "3",
      method: "ai.execute",
      params: [{ prompt: "What is this about?", mode: "ask" }],
    });

    expect(execute_mock).toHaveBeenCalledWith({
      prompt: "What is this about?",
      mode: "ask",
    });
  });

  it("rejects without ai:execute permission", async () => {
    handler.set_settings_service(make_settings_service([]) as never);

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest({ permissions: [] }),
      {
        id: "4",
        method: "ai.execute",
        params: [{ prompt: "test" }],
      },
    );

    expect(response.error).toContain("Missing ai:execute permission");
    expect(execute_mock).not.toHaveBeenCalled();
  });

  it("rejects invalid mode", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      {
        id: "5",
        method: "ai.execute",
        params: [{ prompt: "test", mode: "invalid" }],
      },
    );

    expect(response.error).toContain("Invalid mode");
    expect(execute_mock).not.toHaveBeenCalled();
  });

  it("rejects missing prompt", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      {
        id: "6",
        method: "ai.execute",
        params: [{ mode: "ask" }],
      },
    );

    expect(response.error).toBeDefined();
    expect(execute_mock).not.toHaveBeenCalled();
  });

  it("errors on unknown ai action", async () => {
    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      { id: "7", method: "ai.unknown", params: [] },
    );

    expect(response.error).toContain("Unknown ai action");
  });

  it("errors when AI backend is not initialized", async () => {
    const context = make_context();
    context.ai = undefined as never;
    const handler2 = new PluginRpcHandler(context);
    handler2.set_settings_service(
      make_settings_service(["ai:execute"]) as never,
    );

    const response = await handler2.handle_request(
      "test-plugin",
      make_manifest(),
      {
        id: "8",
        method: "ai.execute",
        params: [{ prompt: "test" }],
      },
    );

    expect(response.error).toContain("AI backend not initialized");
  });

  it("propagates execution failure from backend", async () => {
    execute_mock.mockResolvedValue({
      success: false,
      output: "",
      error: "Provider not available",
    });

    const response = await handler.handle_request(
      "test-plugin",
      make_manifest(),
      {
        id: "9",
        method: "ai.execute",
        params: [{ prompt: "test" }],
      },
    );

    expect(response.error).toBeUndefined();
    expect(response.result).toEqual({
      success: false,
      output: "",
      error: "Provider not available",
    });
  });
});
