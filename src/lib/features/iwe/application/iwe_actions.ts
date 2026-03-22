import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { IweService } from "$lib/features/iwe/application/iwe_service";
import type { IweStore } from "$lib/features/iwe/state/iwe_store.svelte";
import type { EditorStore } from "$lib/features/editor";

export function register_iwe_actions(input: {
  registry: ActionRegistry;
  iwe_service: IweService;
  iwe_store: IweStore;
  editor_store: EditorStore;
}): void {
  const { registry, iwe_service, iwe_store, editor_store } = input;

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
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_workspace_symbols,
    label: "IWE: Workspace Symbols",
    when: () => iwe_store.status === "running",
    execute: async () => {
      await iwe_service.workspace_symbols("");
    },
  });

  registry.register({
    id: ACTION_IDS.iwe_formatting,
    label: "IWE: Format Document",
    when: () => iwe_store.status === "running",
    execute: async () => {
      const note = editor_store.open_note;
      if (!note) return;
      await iwe_service.formatting(note.meta.path);
    },
  });
}
