import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { IweService, IweStore } from "$lib/features/iwe";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { LspStore } from "$lib/features/lsp/state/lsp_store.svelte";
import type { LspCodeAction, LspDiagnostic } from "$lib/features/lsp/types";
import { as_note_path } from "$lib/shared/types/ids";

export function register_lsp_actions(input: {
  registry: ActionRegistry;
  lsp_store: LspStore;
  editor_store: EditorStore;
  editor_service: EditorService;
  note_service: NoteService;
  diagnostics_store: DiagnosticsStore;
  iwe_service: IweService;
  iwe_store: IweStore;
  ui_store: UIStore;
  op_store: OpStore;
}): void {
  const {
    registry,
    lsp_store,
    editor_store,
    editor_service,
    note_service,
    diagnostics_store,
    iwe_service,
    iwe_store,
    ui_store,
    op_store,
  } = input;

  registry.register({
    id: ACTION_IDS.lsp_code_actions,
    label: "Code Actions",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      const cursor = editor_store.cursor;
      if (!note || !cursor) return;

      const all_actions: LspCodeAction[] = [];

      if (iwe_store.status === "running") {
        await iwe_service.code_actions(
          note.meta.path,
          cursor.line - 1,
          cursor.column - 1,
          cursor.line - 1,
          cursor.column - 1,
        );
        all_actions.push(
          ...iwe_store.code_actions.map((a) => ({ ...a, source: "iwes" })),
        );
      }

      lsp_store.set_code_actions(all_actions);
      ui_store.bottom_panel_open = true;
      ui_store.bottom_panel_tab = "lsp_results";
    },
  });

  registry.register({
    id: ACTION_IDS.lsp_code_action_resolve,
    label: "Resolve Code Action",
    execute: async (...args: unknown[]) => {
      const action = args[0] as LspCodeAction | undefined;
      if (!action) return;

      const op_key = "lsp.code_action_resolve";
      op_store.start(op_key, Date.now());

      if (action.source === "iwes") {
        const result = await iwe_service.code_action_resolve(action.raw_json);

        if (!result) {
          op_store.fail(op_key, "Code action failed");
          return;
        }

        if (result.errors.length > 0) {
          op_store.fail(op_key, result.errors.join("; "));
          return;
        }

        const open_path = editor_store.open_note?.meta.path;
        for (const modified_path of result.files_modified) {
          if (modified_path === open_path) {
            editor_service.close_buffer(as_note_path(modified_path));
            await note_service.open_note(modified_path, false, {
              force_reload: true,
            });
          }
        }

        const total_changes =
          result.files_created.length +
          result.files_modified.length +
          result.files_deleted.length;
        op_store.succeed(
          op_key,
          `Code action applied (${total_changes} file${total_changes !== 1 ? "s" : ""} changed)`,
        );
      }
    },
  });

  registry.register({
    id: ACTION_IDS.lsp_refresh_diagnostics,
    label: "Refresh LSP Diagnostics",
    execute: () => {
      const lsp_sources = ["iwe", "code_lsp"] as const;
      const lsp_diags: LspDiagnostic[] = [];
      for (const diag of diagnostics_store.active_diagnostics) {
        if (lsp_sources.includes(diag.source as (typeof lsp_sources)[number])) {
          lsp_diags.push({
            line: diag.line,
            column: diag.column,
            end_line: diag.end_line,
            end_column: diag.end_column,
            severity: diag.severity,
            message: diag.message,
            source: diag.source,
            rule_id: diag.rule_id,
          });
        }
      }
      lsp_store.set_diagnostics(lsp_diags);
    },
  });

  registry.register({
    id: ACTION_IDS.lsp_toggle_results,
    label: "Toggle LSP Results Panel",
    execute: () => {
      if (
        ui_store.bottom_panel_open &&
        ui_store.bottom_panel_tab === "lsp_results"
      ) {
        ui_store.bottom_panel_open = false;
      } else {
        ui_store.bottom_panel_open = true;
        ui_store.bottom_panel_tab = "lsp_results";
      }
    },
  });
}
