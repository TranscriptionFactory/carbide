import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { IweService } from "$lib/features/iwe/application/iwe_service";
import type { IweStore } from "$lib/features/iwe/state/iwe_store.svelte";
import type { EditorStore } from "$lib/features/editor";
import type { EditorService } from "$lib/features/editor";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { IweCodeAction } from "$lib/features/iwe/types";
import { apply_text_edits } from "$lib/features/iwe/domain/apply_text_edits";

export function register_iwe_actions(input: {
  registry: ActionRegistry;
  iwe_service: IweService;
  iwe_store: IweStore;
  editor_store: EditorStore;
  editor_service: EditorService;
  ui_store: UIStore;
}): void {
  const {
    registry,
    iwe_service,
    iwe_store,
    editor_store,
    editor_service,
    ui_store,
  } = input;

  function open_results_panel() {
    ui_store.bottom_panel_open = true;
    ui_store.bottom_panel_tab = "iwe_results";
  }

  registry.register({
    id: ACTION_IDS.iwe_restart,
    label: "IWE: Restart Server",
    execute: async () => {
      await iwe_service.restart();
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_references,
    label: "IWE: Find References",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      const cursor = editor_store.cursor;
      if (!note || !cursor) return;
      await iwe_service.references(
        note.meta.path,
        cursor.line - 1,
        cursor.column - 1,
      );
      open_results_panel();
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_code_actions,
    label: "IWE: Code Actions",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      const cursor = editor_store.cursor;
      if (!note || !cursor) return;
      await iwe_service.code_actions(
        note.meta.path,
        cursor.line - 1,
        cursor.column - 1,
        cursor.line - 1,
        cursor.column - 1,
      );
      open_results_panel();
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_workspace_symbols,
    label: "IWE: Workspace Symbols",
    when: () => iwe_store.status === "running",
    execute: async () => {
      await iwe_service.workspace_symbols("");
      open_results_panel();
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_formatting,
    label: "IWE: Format Document",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      if (!note) return;
      const edits = await iwe_service.formatting(note.meta.path);
      if (edits.length === 0) return;
      const new_markdown = apply_text_edits(note.markdown, edits);
      if (new_markdown === note.markdown) return;
      editor_service.apply_ai_output("full_note", new_markdown, null);
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_rename,
    label: "IWE: Rename Symbol",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      const cursor = editor_store.cursor;
      if (!note || !cursor) return;
      const line = cursor.line - 1;
      const character = cursor.column - 1;
      const prepare = await iwe_service.prepare_rename(
        note.meta.path,
        line,
        character,
      );
      if (!prepare) return;
      ui_store.iwe_rename_dialog = {
        open: true,
        file_path: note.meta.path,
        line,
        character,
        placeholder: prepare.placeholder,
        new_name: prepare.placeholder,
      };
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_rename_confirm,
    label: "IWE: Confirm Rename",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const { file_path, line, character, new_name, placeholder } =
        ui_store.iwe_rename_dialog;
      ui_store.iwe_rename_dialog = {
        open: false,
        file_path: "",
        line: 0,
        character: 0,
        placeholder: "",
        new_name: "",
      };
      if (!new_name || new_name === placeholder) return;
      await iwe_service.rename(file_path, line, character, new_name);
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_code_action_resolve,
    label: "IWE: Resolve Code Action",
    when: () => iwe_store.status === "running",
    execute: async (...args: unknown[]) => {
      const action = args[0] as IweCodeAction | undefined;
      if (!action) return;
      await iwe_service.code_action_resolve(action.raw_json);
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_document_symbols,
    label: "IWE: Document Symbols",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      if (!note) return;
      await iwe_service.document_symbols(note.meta.path);
      open_results_panel();
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_toggle_results,
    label: "IWE: Toggle Results Panel",
    execute: () => {
      if (
        ui_store.bottom_panel_open &&
        ui_store.bottom_panel_tab === "iwe_results"
      ) {
        ui_store.bottom_panel_open = false;
      } else {
        open_results_panel();
      }
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_open_config,
    label: "IWE: Open Configuration",
    execute: () => {
      void registry.execute(ACTION_IDS.note_open, ".iwe/config.toml");
    },
  });
}
