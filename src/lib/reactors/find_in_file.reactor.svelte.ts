import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { SearchStore } from "$lib/features/search";

export function create_find_in_file_reactor(
  ui_store: UIStore,
  editor_store: EditorStore,
  editor_service: EditorService,
  search_store: SearchStore,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const {
        open,
        query,
        selected_match_index,
        case_sensitive,
        whole_word,
        scope,
      } = ui_store.find_in_file;
      const _session_rev = editor_store.session_revision;

      // The plugin re-maps the scope range through every document change and
      // reports the result back here; reading the mirror untracked keeps that
      // write from re-running this effect and re-scrolling on every keystroke.
      const scope_range = untrack(() => ui_store.find_in_file.scope_range);
      const options =
        scope === "selection" && scope_range
          ? { case_sensitive, whole_word, range: scope_range }
          : { case_sensitive, whole_word };

      if (!open || !query) {
        editor_service.update_find_state("", 0, options);
        search_store.set_find_match_count(0);
        return;
      }

      const count = editor_service.update_find_state(
        query,
        selected_match_index,
        options,
        // The plugin re-scans on every document change; without this channel
        // the count would only refresh when the find bar itself changed.
        (update) => {
          search_store.set_find_match_count(update.match_count);
          if (
            update.selected_index !== ui_store.find_in_file.selected_match_index
          ) {
            ui_store.find_in_file.selected_match_index = update.selected_index;
          }
          if (update.range) {
            ui_store.find_in_file.scope_range = update.range;
          } else if (ui_store.find_in_file.scope === "selection") {
            // The scoped selection was edited away; fall back to the whole
            // document rather than leave a zero-width scope matching nothing.
            ui_store.find_in_file.scope = "document";
            ui_store.find_in_file.scope_range = null;
          }
        },
      );
      search_store.set_find_match_count(count);
    });
  });
}
