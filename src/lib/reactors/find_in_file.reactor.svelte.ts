import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { SearchStore } from "$lib/features/search";
import type { TabStore } from "$lib/features/tab";
import type { DocumentService } from "$lib/features/document";

export function create_find_in_file_reactor(
  ui_store: UIStore,
  editor_store: EditorStore,
  editor_service: EditorService,
  search_store: SearchStore,
  tab_store?: TabStore,
  document_service?: DocumentService,
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
      const target =
        tab_store?.active_tab?.kind === "document" && document_service
          ? document_service
          : editor_service;

      // The plugin re-maps the scope range through every document change and
      // reports the result back here; reading the mirror untracked keeps that
      // write from re-running this effect and re-scrolling on every keystroke.
      const scope_range = untrack(() => ui_store.find_in_file.scope_range);
      // The range goes down even when the scope is off, so the plugin keeps
      // mapping it. `scope` alone decides whether it constrains matching.
      const options = scope_range
        ? { case_sensitive, whole_word, scope, range: scope_range }
        : { case_sensitive, whole_word, scope };

      if (!open || !query) {
        target.update_find_state("", 0, options);
        search_store.set_find_match_count(0);
        return;
      }

      const count = target.update_find_state(
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
          } else if (ui_store.find_in_file.scope_range) {
            // The captured passage was edited away. Drop it whichever scope is
            // active: leaving it would let a later toggle re-arm a range whose
            // positions now point at text the user never selected.
            ui_store.find_in_file.scope_range = null;
            ui_store.find_in_file.scope = "document";
          }
        },
      );
      search_store.set_find_match_count(count);
    });
  });
}
