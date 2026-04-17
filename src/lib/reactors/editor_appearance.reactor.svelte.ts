import type { UIStore } from "$lib/app";
import type { EditorService } from "$lib/features/editor";
import { apply_editor_appearance } from "$lib/shared/utils/apply_editor_appearance";

export function create_editor_appearance_reactor(
  ui_store: UIStore,
  editor_service?: EditorService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      apply_editor_appearance(ui_store.editor_settings);
    });

    if (editor_service) {
      $effect(() => {
        editor_service.set_spellcheck(
          ui_store.editor_settings.editor_spellcheck,
        );
      });

      $effect(() => {
        editor_service.set_toolbar_visibility(
          ui_store.editor_settings.editor_toolbar_visibility,
        );
      });

      $effect(() => {
        void editor_service.set_native_feature_flags({
          native_link_hover_enabled:
            ui_store.editor_settings.native_link_hover_enabled,
          native_wiki_suggest_enabled:
            ui_store.editor_settings.native_wiki_suggest_enabled,
          native_link_click_enabled:
            ui_store.editor_settings.native_link_click_enabled,
        });
      });
    }
  });
}
