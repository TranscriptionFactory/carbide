import { untrack } from "svelte";
import type { UIStore } from "$lib/app";
import type { TabStore } from "$lib/features/tab";
import type { GraphService } from "$lib/features/graph";

// A search graph instance lives exactly as long as its tab: released on
// whichever close path removed the tab, created (and searched) for tabs that
// arrive without one, such as tabs restored with the vault.
export function create_search_graph_lifecycle_reactor(
  tab_store: TabStore,
  ui_store: UIStore,
  graph_service: GraphService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const search_tabs = tab_store.tabs.flatMap((t) =>
        t.kind === "search_graph" ? [{ id: t.id, query: t.query }] : [],
      );
      untrack(() => {
        graph_service.release_search_graphs(
          new Set(search_tabs.map((t) => t.id)),
        );
        const settings = ui_store.editor_settings;
        for (const tab of search_tabs) {
          void graph_service.ensure_search_graph(
            tab.id,
            tab.query,
            settings.semantic_similarity_threshold,
            settings.reference_include_sources_in_search,
          );
        }
      });
    });
  });
}
