import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { EditorService } from "$lib/features/editor";
import { smart_block_scaffold } from "../domain/smart_block_scaffold";

export function register_smart_block_actions(
  registry: ActionRegistry,
  editor_service: EditorService,
): void {
  registry.register({
    id: ACTION_IDS.smart_block_insert_query,
    label: "Insert Query Block",
    execute: () => {
      editor_service.insert_text(smart_block_scaffold("query"));
    },
  });

  registry.register({
    id: ACTION_IDS.smart_block_insert_base,
    label: "Insert Base View",
    execute: () => {
      editor_service.insert_text(smart_block_scaffold("base"));
    },
  });

  registry.register({
    id: ACTION_IDS.smart_block_insert_backlinks,
    label: "Insert Backlinks Block",
    execute: () => {
      editor_service.insert_text(smart_block_scaffold("backlinks"));
    },
  });
}
