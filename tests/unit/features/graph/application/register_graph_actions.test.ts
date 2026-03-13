/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi } from "vitest";
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
    set_context_rail_tab: vi.fn(),
    close_context_rail: vi.fn(),
    context_rail_tab: "links",
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

  it("toggles the graph panel", async () => {
    register_graph_actions(input);
    const calls = vi.mocked(mock_registry.register).mock.calls;
    const toggle_call = calls.find(
      (call) =>
        (call[0] as { id: string }).id === ACTION_IDS.graph_toggle_panel,
    );
    const toggle_action = toggle_call
      ? (toggle_call[0] as { execute: () => Promise<void> })
      : null;

    // Open when closed
    await toggle_action?.execute();
    expect(vi.mocked(mock_ui_store.set_context_rail_tab)).toHaveBeenCalledWith(
      "graph",
    );
    expect(vi.mocked(mock_graph_service.focus_active_note)).toHaveBeenCalled();

    // Close when open and active
    graph_store.set_panel_open(true);
    (mock_ui_store as any).context_rail_tab = "graph";
    await toggle_action?.execute();
    expect(vi.mocked(mock_graph_service.close_panel)).toHaveBeenCalled();
    expect(vi.mocked(mock_ui_store.close_context_rail)).toHaveBeenCalledWith(
      "links",
    );
  });

  it("closes with preserve_context_rail option", async () => {
    register_graph_actions(input);
    const calls = vi.mocked(mock_registry.register).mock.calls;
    const close_call = calls.find(
      (call) => (call[0] as { id: string }).id === ACTION_IDS.graph_close,
    );
    const close_action = close_call
      ? (close_call[0] as { execute: (args: unknown) => Promise<void> })
      : null;

    await close_action?.execute({ preserve_context_rail: true });
    expect(vi.mocked(mock_graph_service.close_panel)).toHaveBeenCalled();
    expect(vi.mocked(mock_ui_store.set_context_rail_tab)).toHaveBeenCalledWith(
      "links",
    );
  });
});
