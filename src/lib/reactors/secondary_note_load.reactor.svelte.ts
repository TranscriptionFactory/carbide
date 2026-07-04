import type { TabStore } from "$lib/features/tab";
import type { TabService } from "$lib/features/tab";

export function create_secondary_note_load_reactor(
  tab_store: TabStore,
  tab_service: TabService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      const secondary = tab_store.secondary_tab;
      if (!secondary || secondary.kind !== "note") return;
      if (tab_store.get_cached_note(secondary.id)) return;
      void tab_service.load_secondary_note();
    });
  });
}
