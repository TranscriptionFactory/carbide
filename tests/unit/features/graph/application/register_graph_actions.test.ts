/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { register_graph_actions } from "$lib/features/graph/application/graph_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

describe("register_graph_actions", () => {
  const mock_registry = {
    register: vi.fn(),
  } as unknown as ActionRegistry;

  const mock_ui_store = {
    set_sidebar_view: vi.fn(),
    sidebar_view: "explorer",
    sidebar_open: true,
  } as unknown as UIStore;

  const mock_graph_service = {
    focus_active_note: vi.fn(),
    refresh_current: vi.fn(),
    close_panel: vi.fn(),
    select_node: vi.fn(),
    set_hovered_node: vi.fn(),
    set_filter_query: vi.fn(),
  } as unknown as GraphService;

  const graph_store = new GraphStore();

  const input = {
    registry: mock_registry,
    stores: {
      ui: mock_ui_store,
    },
    graph_store,
    graph_service: mock_graph_service,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (mock_ui_store as any).sidebar_view = "explorer";
    (mock_ui_store as any).sidebar_open = true;
    graph_store.set_panel_open(false);
  });

  it("registers all graph actions", () => {
    register_graph_actions(input);

    const calls = vi.mocked(mock_registry.register).mock.calls;
    const registered_ids = calls.map((call) => (call[0] as { id: string }).id);

    expect(registered_ids).toContain(ACTION_IDS.graph_toggle_panel);
    expect(registered_ids).toContain(ACTION_IDS.graph_close);
    expect(registered_ids).toContain(ACTION_IDS.graph_focus_active_note);
    expect(registered_ids).toContain(ACTION_IDS.graph_refresh);
    expect(registered_ids).toContain(ACTION_IDS.graph_select_node);
    expect(registered_ids).toContain(ACTION_IDS.graph_set_hovered_node);
    expect(registered_ids).toContain(ACTION_IDS.graph_set_filter_query);
  });

  it("toggles the graph panel open via sidebar", async () => {
    register_graph_actions(input);
    const calls = vi.mocked(mock_registry.register).mock.calls;
    const toggle_call = calls.find(
      (call) =>
        (call[0] as { id: string }).id === ACTION_IDS.graph_toggle_panel,
    );
    const toggle_action = toggle_call
      ? (toggle_call[0] as { execute: () => Promise<void> })
      : null;

    await toggle_action?.execute();
    expect(vi.mocked(mock_ui_store.set_sidebar_view)).toHaveBeenCalledWith(
      "graph",
    );
    expect(vi.mocked(mock_graph_service.focus_active_note)).toHaveBeenCalled();
  });

  it("toggles the graph panel closed when already showing", async () => {
    register_graph_actions(input);
    const calls = vi.mocked(mock_registry.register).mock.calls;
    const toggle_call = calls.find(
      (call) =>
        (call[0] as { id: string }).id === ACTION_IDS.graph_toggle_panel,
    );
    const toggle_action = toggle_call
      ? (toggle_call[0] as { execute: () => Promise<void> })
      : null;

    graph_store.set_panel_open(true);
    (mock_ui_store as any).sidebar_view = "graph";
    (mock_ui_store as any).sidebar_open = true;
    await toggle_action?.execute();
    expect(vi.mocked(mock_graph_service.close_panel)).toHaveBeenCalled();
  });

  it("closes with preserve_context_rail keeping sidebar view", async () => {
    register_graph_actions(input);
    const calls = vi.mocked(mock_registry.register).mock.calls;
    const close_call = calls.find(
      (call) => (call[0] as { id: string }).id === ACTION_IDS.graph_close,
    );
    const close_action = close_call
      ? (close_call[0] as { execute: (args: unknown) => Promise<void> })
      : null;

    (mock_ui_store as any).sidebar_view = "graph";
    await close_action?.execute({ preserve_context_rail: true });
    expect(vi.mocked(mock_graph_service.close_panel)).toHaveBeenCalled();
    expect((mock_ui_store as any).sidebar_view).toBe("graph");
  });

  it("closes and resets sidebar to explorer by default", async () => {
    register_graph_actions(input);
    const calls = vi.mocked(mock_registry.register).mock.calls;
    const close_call = calls.find(
      (call) => (call[0] as { id: string }).id === ACTION_IDS.graph_close,
    );
    const close_action = close_call
      ? (close_call[0] as { execute: (args: unknown) => Promise<void> })
      : null;

    (mock_ui_store as any).sidebar_view = "graph";
    await close_action?.execute({});
    expect(vi.mocked(mock_graph_service.close_panel)).toHaveBeenCalled();
    expect((mock_ui_store as any).sidebar_view).toBe("explorer");
  });

  describe("graph_set_group_mode", () => {
    function set_group_mode_action() {
      register_graph_actions(input);
      const call = vi
        .mocked(mock_registry.register)
        .mock.calls.find(
          (c) =>
            (c[0] as { id: string }).id === ACTION_IDS.graph_set_group_mode,
        );
      return call
        ? (call[0] as { execute: (mode: unknown) => Promise<void> })
        : null;
    }

    it("selects each grouping mode directly", async () => {
      const action = set_group_mode_action();

      await action?.execute("cluster");
      expect(graph_store.group_mode).toBe("cluster");

      await action?.execute("none");
      expect(graph_store.group_mode).toBe("none");

      await action?.execute("folder");
      expect(graph_store.group_mode).toBe("folder");
    });

    it("selecting the current mode is a no-op", async () => {
      const action = set_group_mode_action();

      await action?.execute("cluster");
      await action?.execute("cluster");
      expect(graph_store.group_mode).toBe("cluster");
    });

    it("ignores values that are not grouping modes", async () => {
      const action = set_group_mode_action();

      await action?.execute("cluster");
      await action?.execute("tags");
      await action?.execute(undefined);
      await action?.execute(3);

      expect(graph_store.group_mode).toBe("cluster");
    });
  });
});
