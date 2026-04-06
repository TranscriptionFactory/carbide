import type { EditorStore } from "$lib/features/editor";
import type { PluginService } from "$lib/features/plugin";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("plugin_file_type_reactor");

export function create_plugin_file_type_reactor(
  editor_store: EditorStore,
  plugin_service: PluginService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const note = editor_store.open_note;
      if (!note) return;

      void plugin_service
        .activate_for_file_type(note.meta.path)
        .catch((error: unknown) => {
          log.from_error("Failed to activate plugins for file type", error);
        });
    });
  });
}
