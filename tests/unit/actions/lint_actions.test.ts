import { describe, it, expect, vi, beforeEach } from "vitest";
import { register_lint_actions } from "$lib/features/lint/application/lint_actions";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import type { LintService } from "$lib/features/lint/application/lint_service";
import type { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

function create_mock_registry(): ActionRegistry & { actions: Map<string, any> } {
  const actions = new Map<string, any>();
  return {
    actions,
    register(action: any) {
      actions.set(action.id, action);
    },
    execute: vi.fn(),
    get_all: vi.fn(),
    get: vi.fn(),
    unregister: vi.fn(),
  } as any;
}

function create_mock_lint_store(
  overrides: Partial<LintStore> = {},
): LintStore {
  return {
    is_running: false,
    active_diagnostics: [],
    active_file_path: null,
    error_count: 0,
    warning_count: 0,
    ...overrides,
  } as any;
}

describe("register_lint_actions", () => {
  let registry: ReturnType<typeof create_mock_registry>;
  let ui_store: { problems_panel_open: boolean };

  beforeEach(() => {
    registry = create_mock_registry();
    ui_store = { problems_panel_open: false };
    register_lint_actions({
      registry,
      lint_service: {} as LintService,
      lint_store: create_mock_lint_store(),
      editor_store: {} as EditorStore,
      ui_store: ui_store as any,
    });
  });

  it("registers all expected lint actions", () => {
    expect(registry.actions.has(ACTION_IDS.lint_format_file)).toBe(true);
    expect(registry.actions.has(ACTION_IDS.lint_format_vault)).toBe(true);
    expect(registry.actions.has(ACTION_IDS.lint_fix_all)).toBe(true);
    expect(registry.actions.has(ACTION_IDS.lint_check_vault)).toBe(true);
    expect(registry.actions.has(ACTION_IDS.lint_toggle_problems)).toBe(true);
    expect(registry.actions.has(ACTION_IDS.lint_next_diagnostic)).toBe(true);
    expect(registry.actions.has(ACTION_IDS.lint_prev_diagnostic)).toBe(true);
  });

  it("toggle_problems toggles ui_store.problems_panel_open", () => {
    const action = registry.actions.get(ACTION_IDS.lint_toggle_problems);

    action.execute();
    expect(ui_store.problems_panel_open).toBe(true);

    action.execute();
    expect(ui_store.problems_panel_open).toBe(false);
  });

  it("next_diagnostic opens problems panel if closed", () => {
    const action = registry.actions.get(ACTION_IDS.lint_next_diagnostic);

    action.execute();
    expect(ui_store.problems_panel_open).toBe(true);
  });

  it("prev_diagnostic opens problems panel if closed", () => {
    const action = registry.actions.get(ACTION_IDS.lint_prev_diagnostic);

    action.execute();
    expect(ui_store.problems_panel_open).toBe(true);
  });

  it("next_diagnostic has F8 shortcut", () => {
    const action = registry.actions.get(ACTION_IDS.lint_next_diagnostic);
    expect(action.shortcut).toBe("F8");
  });

  it("prev_diagnostic has Shift+F8 shortcut", () => {
    const action = registry.actions.get(ACTION_IDS.lint_prev_diagnostic);
    expect(action.shortcut).toBe("Shift+F8");
  });

  it("toggle_problems has CmdOrCtrl+Shift+M shortcut", () => {
    const action = registry.actions.get(ACTION_IDS.lint_toggle_problems);
    expect(action.shortcut).toBe("CmdOrCtrl+Shift+M");
  });
});
