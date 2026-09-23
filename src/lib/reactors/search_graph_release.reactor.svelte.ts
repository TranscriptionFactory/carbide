import { untrack } from "svelte";
import type { TabStore } from "$lib/features/tab";
import type { GraphService } from "$lib/features/graph";

// A search graph instance lives exactly as long as its tab, whichever close
// path (tab bar, shortcuts, close others/all) removed it.
export function create_search_graph_release_reactor(
  tab_store: TabStore,
  graph_service: GraphService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const open = new Set(
        tab_store.tabs
          .filter((t) => t.kind === "search_graph")
          .map((t) => t.id),
      );
      untrack(() => {
        graph_service.release_search_graphs(open);
      });
    });
  });
}
