<script lang="ts">
  import type { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
  import SearchGraphCanvas from "$lib/features/graph/ui/search_graph_canvas.svelte";

  let { store, tab_id }: { store: SearchGraphStore; tab_id: string } = $props();

  const instance = $derived(store.get_instance(tab_id));
  const snapshot = $derived(instance?.snapshot ?? null);
</script>

{#if snapshot}
  <SearchGraphCanvas
    {snapshot}
    selected_node_id={instance?.selected_node_id ?? null}
    selected_node_ids={instance?.selected_node_ids ?? new Set()}
    hovered_node_id={instance?.hovered_node_id ?? null}
    show_semantic_edges={instance?.show_semantic_edges ?? false}
    show_smart_link_edges={instance?.show_smart_link_edges ?? false}
    show_neighbors={instance?.show_neighbors ?? true}
    min_score={instance?.min_score ?? 0}
    theme={undefined as never}
    on_select_node={(id) => store.select_node(tab_id, id)}
    on_hover_node={(id) => store.set_hovered_node(tab_id, id)}
    on_open_node={() => {}}
  />
{/if}
