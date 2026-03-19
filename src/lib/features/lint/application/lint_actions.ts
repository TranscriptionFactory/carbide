import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { LintService } from "$lib/features/lint/application/lint_service";
import type { LintStore } from "$lib/features/lint/state/lint_store.svelte";
import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { NoteId } from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";
import { apply_lint_text_edits } from "$lib/features/lint/domain/apply_text_edits";

export function register_lint_actions(input: {
  registry: ActionRegistry;
  lint_service: LintService;
  lint_store: LintStore;
  editor_store: EditorStore;
  ui_store: UIStore;
}): void {
  const { registry, lint_service, lint_store, editor_store, ui_store } = input;

  registry.register({
    id: ACTION_IDS.lint_format_file,
    label: "Format File",
    shortcut: "CmdOrCtrl+Shift+F",
    when: () => lint_store.is_running,
    execute: async () => {
      const path = lint_store.active_file_path ?? "";
      if (!path) return;

      const edits = await lint_service.format_file(path);
      if (edits.length === 0) return;

      const open_note = editor_store.open_note;
      if (!open_note) return;

      const current = open_note.markdown ?? "";
      const formatted = apply_lint_text_edits(current, edits);
      if (formatted === current) return;

      editor_store.set_markdown(
        open_note.meta.id as NoteId,
        as_markdown_text(formatted),
      );
      editor_store.set_dirty(open_note.meta.id as NoteId, true);
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
    execute: async () => {
      const path = lint_store.active_file_path ?? "";
      if (!path) return;

      const fixed = await lint_service.fix_all(path);
      if (fixed === null) return;

      const open_note = editor_store.open_note;
      if (!open_note) return;

      editor_store.set_markdown(
        open_note.meta.id as NoteId,
        as_markdown_text(fixed),
      );
      editor_store.set_dirty(open_note.meta.id as NoteId, true);
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

  registry.register({
    id: ACTION_IDS.lint_next_diagnostic,
    label: "Next Diagnostic",
    shortcut: "F8",
    when: () =>
      lint_store.is_running && lint_store.active_diagnostics.length > 0,
    execute: () => {
      if (!ui_store.problems_panel_open) {
        ui_store.problems_panel_open = true;
      }
    },
  });

  registry.register({
    id: ACTION_IDS.lint_prev_diagnostic,
    label: "Previous Diagnostic",
    shortcut: "Shift+F8",
    when: () =>
      lint_store.is_running && lint_store.active_diagnostics.length > 0,
    execute: () => {
      if (!ui_store.problems_panel_open) {
        ui_store.problems_panel_open = true;
      }
    },
  });
}
