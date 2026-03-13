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

    const registered_ids = vi.mocked(mock_registry.register).mock.calls.map(
      (call) => (call[0] as any).id,
    );

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
    const toggle_action = vi.mocked(mock_registry.register).mock.calls.find(
      (call) => (call[0] as any).id === ACTION_IDS.graph_toggle_panel,
    )![0] as any;

    // Open when closed
    await toggle_action.execute();
    expect(mock_ui_store.set_context_rail_tab).toHaveBeenCalledWith("graph");
    expect(mock_graph_service.focus_active_note).toHaveBeenCalled();

    // Close when open and active
    graph_store.set_panel_open(true);
    (mock_ui_store as any).context_rail_tab = "graph";
    await toggle_action.execute();
    expect(mock_graph_service.close_panel).toHaveBeenCalled();
    expect(mock_ui_store.close_context_rail).toHaveBeenCalledWith("links");
  });

  it("closes with preserve_context_rail option", async () => {
    register_graph_actions(input);
    const close_action = vi.mocked(mock_registry.register).mock.calls.find(
      (call) => (call[0] as any).id === ACTION_IDS.graph_close,
    )![0] as any;

    await close_action.execute({ preserve_context_rail: true });
    expect(mock_graph_service.close_panel).toHaveBeenCalled();
    expect(mock_ui_store.set_context_rail_tab).toHaveBeenCalledWith("links");
  });
});
