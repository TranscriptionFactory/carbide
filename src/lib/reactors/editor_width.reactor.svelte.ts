import type { UIStore } from "$lib/app";
import { apply_editor_width } from "$lib/shared/utils/apply_editor_width";

export function create_editor_width_reactor(ui_store: UIStore): () => void {
  return $effect.root(() => {
    $effect(() => {
      apply_editor_width(ui_store.editor_settings.editor_max_width_ch);
    });
  });
}
