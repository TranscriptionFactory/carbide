<script lang="ts">
  import type { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
  import SearchGraphResultList from "$lib/features/graph/ui/search_graph_result_list.svelte";

  let {
    store,
    tab_id,
    on_scroll_done,
  }: {
    store: SearchGraphStore;
    tab_id: string;
    on_scroll_done: () => void;
  } = $props();

  const instance = $derived(store.get_instance(tab_id));
  const snapshot = $derived(instance?.snapshot ?? null);
  const noop = () => {};
</script>

{#if snapshot && instance}
  <SearchGraphResultList
    nodes={snapshot.nodes}
    edges={snapshot.edges}
    selected_node_id={instance.selected_node_id}
    selected_node_ids={instance.selected_node_ids}
    hovered_node_id={instance.hovered_node_id}
    scroll_to_path={instance.scroll_to_path}
    show_neighbors={instance.show_neighbors}
    min_score={instance.min_score}
    sort_mode={instance.sort_mode}
    sort_ascending={instance.sort_ascending}
    on_select={(path) => store.select_node(tab_id, path)}
    on_hover={noop}
    on_open={noop}
    on_scroll_done={() => {
      on_scroll_done();
      store.clear_scroll_to(tab_id);
    }}
    on_toggle_select={noop}
    on_set_min_score={noop}
    on_toggle_neighbors={noop}
    on_set_sort_mode={noop}
    on_toggle_sort_order={noop}
    on_open_to_side={noop}
    on_copy_path={noop}
    on_reveal_in_file_manager={noop}
    on_open_in_default_app={noop}
    on_find_similar={noop}
  />
{/if}
