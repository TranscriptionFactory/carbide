<script lang="ts">
  import { untrack } from "svelte";
  import SearchGraphTabView from "$lib/features/graph/ui/search_graph_tab_view.svelte";

  let { initial_tab_id }: { initial_tab_id: string } = $props();

  let tab_id = $state(untrack(() => initial_tab_id));

  export function switch_tab(next: string) {
    tab_id = next;
  }
</script>

<SearchGraphTabView {tab_id} initial_query="" />
