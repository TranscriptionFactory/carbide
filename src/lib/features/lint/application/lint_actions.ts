import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { LintService } from "$lib/features/lint/application/lint_service";
import type { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";

export function register_lint_actions(input: {
  registry: ActionRegistry;
  lint_service: LintService;
  lint_store: LintStore;
  ui_store: UIStore;
}): void {
  const { registry, lint_service, lint_store, ui_store } = input;

  registry.register({
    id: ACTION_IDS.lint_format_file,
    label: "Format File",
    shortcut: "CmdOrCtrl+Shift+F",
    when: () => lint_store.is_running,
    execute: () => {
      void lint_service.format_file(lint_store.active_file_path ?? "");
    },
  });

  registry.register({
    id: ACTION_IDS.lint_format_vault,
    label: "Format All Files",
    when: () => lint_store.is_running,
    execute: () => {
      void lint_service.format_vault();
    },
  });

  registry.register({
    id: ACTION_IDS.lint_fix_all,
    label: "Fix All Lint Issues",
    when: () => lint_store.is_running,
    execute: () => {
      void lint_service.fix_all(lint_store.active_file_path ?? "");
    },
  });

  registry.register({
    id: ACTION_IDS.lint_check_vault,
    label: "Lint All Files",
    execute: () => {
      void lint_service.check_vault();
    },
  });

  registry.register({
    id: ACTION_IDS.lint_toggle_problems,
    label: "Toggle Problems Panel",
    shortcut: "CmdOrCtrl+Shift+M",
    execute: () => {
      ui_store.problems_panel_open = !ui_store.problems_panel_open;
    },
  });
}
