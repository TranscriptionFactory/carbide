import { describe, it, expect, vi, beforeEach } from "vitest";
import { register_lint_actions } from "$lib/features/lint/application/lint_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type {
  ActionRegistry,
  AppAction,
} from "$lib/app/action_registry/action_registry";
import type { LintService } from "$lib/features/lint/application/lint_service";
import type { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type {
  UIStore,
  BottomPanelTab,
} from "$lib/app/orchestration/ui_store.svelte";
import type { DiagnosticsStore } from "$lib/features/diagnostics";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";

function create_mock_registry() {
  const actions = new Map<string, AppAction>();
  const registry = {
    register(action: AppAction) {
      actions.set(action.id, action);
    },
    execute: vi.fn(),
    get_all: vi.fn(),
    get: vi.fn(),
    unregister: vi.fn(),
  } as unknown as ActionRegistry;
  return { registry, actions };
}

function create_mock_lint_store(overrides: Partial<LintStore> = {}): LintStore {
  return {
    is_running: false,
    ...overrides,
  } as unknown as LintStore;
}

function create_mock_diagnostics_store(
  overrides: Partial<DiagnosticsStore> = {},
): DiagnosticsStore {
  return {
    active_diagnostics: [],
    active_file_path: null,
    error_count: 0,
    warning_count: 0,
    ...overrides,
  } as DiagnosticsStore;
}

function create_mock_ui_store() {
  return {
    bottom_panel_open: false,
    bottom_panel_tab: "terminal" as BottomPanelTab,
    editor_settings: { ...DEFAULT_EDITOR_SETTINGS },
  } as unknown as Pick<
    UIStore,
    "bottom_panel_open" | "bottom_panel_tab" | "editor_settings"
  >;
}

function expect_defined<T>(value: T | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

describe("register_lint_actions", () => {
  let actions: Map<string, AppAction>;
  let ui_store: Pick<
    UIStore,
    "bottom_panel_open" | "bottom_panel_tab" | "editor_settings"
  >;

  beforeEach(() => {
    const mock = create_mock_registry();
    actions = mock.actions;
    ui_store = create_mock_ui_store();
    register_lint_actions({
      registry: mock.registry,
      lint_service: {} as LintService,
      lint_store: create_mock_lint_store(),
      editor_store: {} as EditorStore,
      editor_service: {
        sync_visual_from_markdown: vi.fn(),
      } as unknown as EditorService,
      ui_store: ui_store as UIStore,
      diagnostics_store: create_mock_diagnostics_store(),
    });
  });

  it("registers all expected lint actions", () => {
    expect(actions.has(ACTION_IDS.lint_format_file)).toBe(true);
    expect(actions.has(ACTION_IDS.lint_format_vault)).toBe(true);
    expect(actions.has(ACTION_IDS.lint_fix_all)).toBe(true);
    expect(actions.has(ACTION_IDS.lint_check_vault)).toBe(true);
    expect(actions.has(ACTION_IDS.lint_toggle_problems)).toBe(true);
    expect(actions.has(ACTION_IDS.lint_next_diagnostic)).toBe(true);
    expect(actions.has(ACTION_IDS.lint_prev_diagnostic)).toBe(true);
  });

  it("toggle_problems opens bottom panel to problems tab", async () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_toggle_problems),
      "toggle problems action",
    );

    await action.execute();
    expect(ui_store.bottom_panel_open).toBe(true);
    expect(ui_store.bottom_panel_tab).toBe("problems");
  });

  it("toggle_problems closes panel when already on problems tab", async () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_toggle_problems),
      "toggle problems action",
    );

    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "problems";

    await action.execute();
    expect(ui_store.bottom_panel_open).toBe(false);
  });

  it("toggle_problems switches tab when panel open on different tab", async () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_toggle_problems),
      "toggle problems action",
    );

    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "terminal";

    await action.execute();
    expect(ui_store.bottom_panel_open).toBe(true);
    expect(ui_store.bottom_panel_tab).toBe("problems");
  });

  it("next_diagnostic opens problems tab", async () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_next_diagnostic),
      "next diagnostic action",
    );

    await action.execute();
    expect(ui_store.bottom_panel_open).toBe(true);
    expect(ui_store.bottom_panel_tab).toBe("problems");
  });

  it("prev_diagnostic opens problems tab", async () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_prev_diagnostic),
      "prev diagnostic action",
    );

    await action.execute();
    expect(ui_store.bottom_panel_open).toBe(true);
    expect(ui_store.bottom_panel_tab).toBe("problems");
  });

  it("next_diagnostic has F8 shortcut", () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_next_diagnostic),
      "next diagnostic action",
    );
    expect(action.shortcut).toBe("F8");
  });

  it("prev_diagnostic has Shift+F8 shortcut", () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_prev_diagnostic),
      "prev diagnostic action",
    );
    expect(action.shortcut).toBe("Shift+F8");
  });

  it("toggle_problems has CmdOrCtrl+Shift+M shortcut", () => {
    const action = expect_defined(
      actions.get(ACTION_IDS.lint_toggle_problems),
      "toggle problems action",
    );
    expect(action.shortcut).toBe("CmdOrCtrl+Shift+M");
  });
});
