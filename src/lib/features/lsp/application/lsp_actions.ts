import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { IweService, IweStore } from "$lib/features/iwe";
import type { EditorStore } from "$lib/features/editor";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { LspStore } from "$lib/features/lsp/state/lsp_store.svelte";
import type { LspCodeAction } from "$lib/features/lsp/types";

export function register_lsp_actions(input: {
  registry: ActionRegistry;
  lsp_store: LspStore;
  editor_store: EditorStore;
  iwe_service: IweService;
  iwe_store: IweStore;
  ui_store: UIStore;
}): void {
  const {
    registry,
    lsp_store,
    editor_store,
    iwe_service,
    iwe_store,
    ui_store,
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

      if (action.source === "iwes") {
        await iwe_service.code_action_resolve(action.raw_json);
      }
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
