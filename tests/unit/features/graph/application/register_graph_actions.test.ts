/* eslint-disable @typescript-eslint/unbound-method, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { register_graph_actions } from "$lib/features/graph/application/graph_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import type { GraphService } from "$lib/features/graph/application/graph_service";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { SettingsService } from "$lib/features/settings";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

describe("register_graph_actions", () => {
  const mock_registry = {
    register: vi.fn(),
  } as unknown as ActionRegistry;

  const mock_ui_store = {
    set_sidebar_view: vi.fn(),
    sidebar_view: "explorer",
    sidebar_open: true,
    editor_settings: { ...DEFAULT_EDITOR_SETTINGS },
    set_editor_settings: vi.fn((settings) => {
      (mock_ui_store as any).editor_settings = settings;
    }),
  } as unknown as UIStore;

  const mock_settings_service = {
    save_settings: vi.fn().mockResolvedValue({ status: "success" }),
  } as unknown as SettingsService;

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
    services: {
      settings: mock_settings_service,
    },
    graph_store,
    graph_service: mock_graph_service,
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    (mock_ui_store as any).sidebar_view = "explorer";
    (mock_ui_store as any).sidebar_open = true;
    (mock_ui_store as any).editor_settings = { ...DEFAULT_EDITOR_SETTINGS };
    vi.mocked(mock_settings_service.save_settings).mockResolvedValue({
      status: "success",
    } as any);
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

  function action_for(id: string) {
    register_graph_actions(input);
    const call = vi
      .mocked(mock_registry.register)
      .mock.calls.find((c) => (c[0] as { id: string }).id === id);
    return call
      ? (call[0] as { execute: (arg?: unknown) => Promise<void> })
      : null;
  }

  function group_mode() {
    return (mock_ui_store as any).editor_settings.graph_group_mode;
  }

  function group_order() {
    return (mock_ui_store as any).editor_settings.graph_group_order;
  }

  describe("graph_set_group_mode", () => {
    it("selects each grouping mode directly", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_mode);

      for (const mode of ["cluster", "tag", "degree", "none", "folder"]) {
        await action?.execute(mode);
        expect(group_mode()).toBe(mode);
      }
    });

    it("persists the mode so it survives a restart", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_mode);

      await action?.execute("tag");

      expect(
        vi.mocked(mock_settings_service.save_settings),
      ).toHaveBeenCalledWith(
        expect.objectContaining({ graph_group_mode: "tag" }),
      );
    });

    it("keeps the previous mode when saving fails", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_mode);
      vi.mocked(mock_settings_service.save_settings).mockResolvedValue({
        status: "error",
      } as any);

      await action?.execute("degree");

      expect(group_mode()).toBe("folder");
    });

    it("selecting the current mode is a no-op", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_mode);

      await action?.execute("cluster");
      await action?.execute("cluster");
      expect(group_mode()).toBe("cluster");
    });

    it("ignores values that are not grouping modes", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_mode);

      await action?.execute("cluster");
      await action?.execute("tags");
      await action?.execute(undefined);
      await action?.execute(3);

      expect(group_mode()).toBe("cluster");
    });
  });

  describe("graph_cycle_group_mode", () => {
    it("rotates through every grouping mode and back to the start", async () => {
      const action = action_for(ACTION_IDS.graph_cycle_group_mode);
      const seen: string[] = [];

      for (let i = 0; i < 5; i++) {
        await action?.execute();
        seen.push(group_mode());
      }

      expect(seen).toEqual(["cluster", "tag", "degree", "none", "folder"]);
    });
  });

  describe("graph_set_group_order", () => {
    it("selects each ordering mode directly", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_order);

      for (const order of ["date_created", "date_modified", "name"]) {
        await action?.execute(order);
        expect(group_order()).toBe(order);
      }
    });

    it("persists the ordering so it survives a restart", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_order);

      await action?.execute("date_modified");

      expect(
        vi.mocked(mock_settings_service.save_settings),
      ).toHaveBeenCalledWith(
        expect.objectContaining({ graph_group_order: "date_modified" }),
      );
    });

    it("ignores values that are not ordering modes", async () => {
      const action = action_for(ACTION_IDS.graph_set_group_order);

      await action?.execute("relevance");
      await action?.execute(undefined);

      expect(group_order()).toBe("name");
    });

    it("leaves the grouping mode untouched", async () => {
      await action_for(ACTION_IDS.graph_set_group_mode)?.execute("tag");
      await action_for(ACTION_IDS.graph_set_group_order)?.execute(
        "date_created",
      );

      expect(group_mode()).toBe("tag");
      expect(group_order()).toBe("date_created");
    });
  });
});
