import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { NoteService } from "$lib/features/note";
import type { DiagnosticsStore } from "$lib/features/diagnostics";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { LspStore } from "$lib/features/lsp/state/lsp_store.svelte";
import type { LspCodeAction, LspDiagnostic } from "$lib/features/lsp/types";
import type { MarkdownLspService } from "$lib/features/markdown_lsp";
import {
  apply_workspace_edit_result,
  type WorkspaceEditDeps,
} from "$lib/features/lsp/application/apply_workspace_edit_result";

export function register_lsp_actions(input: {
  registry: ActionRegistry;
  lsp_store: LspStore;
  editor_store: EditorStore;
  editor_service: EditorService;
  note_service: NoteService;
  diagnostics_store: DiagnosticsStore;
  ui_store: UIStore;
  op_store: OpStore;
  markdown_lsp_service: MarkdownLspService;
  workspace_edit_deps: WorkspaceEditDeps;
}): void {
  const {
    registry,
    lsp_store,
    diagnostics_store,
    ui_store,
    markdown_lsp_service,
    workspace_edit_deps,
  } = input;

  registry.register({
    id: ACTION_IDS.lsp_code_actions,
    label: "Code Actions",
    execute: async () => {
      ui_store.bottom_panel_open = true;
      ui_store.bottom_panel_tab = "lsp_results";
    },
  });

  registry.register({
    id: ACTION_IDS.lsp_code_action_resolve,
    label: "Resolve Code Action",
    execute: async (action) => {
      const code_action = action as LspCodeAction;
      const lsp_sources = ["Markdown LSP", "IWE"];
      if (lsp_sources.includes(code_action.source)) {
        const result = await markdown_lsp_service.code_action_resolve(
          code_action.raw_json,
        );
        if (result) {
          await apply_workspace_edit_result(result, workspace_edit_deps);
        }
      }
    },
  });

  registry.register({
    id: ACTION_IDS.lsp_refresh_diagnostics,
    label: "Refresh LSP Diagnostics",
    execute: () => {
      const lsp_sources = ["code_lsp"] as const;
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
