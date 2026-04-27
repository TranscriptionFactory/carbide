<script lang="ts">
  import { Search, Sparkles, Link, X } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { detect_file_type } from "$lib/features/document";
  import { is_linked_note_path } from "$lib/shared/types/note";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import SearchGraphCanvas from "$lib/features/graph/ui/search_graph_canvas.svelte";
  import SearchGraphResultList from "$lib/features/graph/ui/search_graph_result_list.svelte";

  type Props = {
    tab_id: string;
    initial_query: string;
  };

  let { tab_id, initial_query }: Props = $props();

  const { stores, services, action_registry } = use_app_context();

  const instance = $derived(stores.search_graph.get_instance(tab_id));
  const snapshot = $derived(instance?.snapshot ?? null);
  const status = $derived(instance?.status ?? "idle");

  let debounce_timer: ReturnType<typeof setTimeout> | undefined;

  function handle_input(value: string) {
    void action_registry.execute(ACTION_IDS.search_graph_execute, {
      tab_id,
      query: value,
    });
  }

  function debounced_input(value: string) {
    clearTimeout(debounce_timer);
    stores.search_graph.update_query(tab_id, value);
    debounce_timer = setTimeout(() => handle_input(value), 300);
  }

  function select_node(path: string | null) {
    if (!path) return;
    void action_registry.execute(ACTION_IDS.search_graph_select_node, {
      tab_id,
      node_id: path,
    });
  }

  function hover_node(path: string | null) {
    void action_registry.execute(ACTION_IDS.search_graph_hover_node, {
      tab_id,
      node_id: path,
    });
  }

  async function resolve_file_path(path: string): Promise<string | null> {
    if (is_linked_note_path(path)) {
      return services.reference.resolve_linked_note_file_path(path);
    }
    return path;
  }

  async function open_node(path: string) {
    if (detect_file_type(path)) {
      const file_path = await resolve_file_path(path);
      if (file_path) {
        void action_registry.execute(ACTION_IDS.document_open, { file_path });
      }
    } else {
      void action_registry.execute(ACTION_IDS.note_open, path);
    }
  }

  function expand_node(path: string) {
    void action_registry.execute(ACTION_IDS.search_graph_expand_node, {
      tab_id,
      node_path: path,
    });
  }

  function close_tab() {
    void action_registry.execute(ACTION_IDS.search_graph_close, tab_id);
  }

  function clear_scroll() {
    stores.search_graph.clear_scroll_to(tab_id);
  }
</script>

<div class="SearchGraphTabView">
  <div class="SearchGraphTabView__toolbar">
    <div class="SearchGraphTabView__search">
      <Search size={14} />
      <Input
        value={instance?.query ?? initial_query}
        placeholder="Search notes..."
        oninput={(event) => debounced_input(event.currentTarget.value)}
      />
    </div>
    <div class="SearchGraphTabView__actions">
      <Button
        variant="ghost"
        size="icon"
        title={instance?.show_semantic_edges
          ? "Hide semantic edges"
          : "Show semantic edges"}
        aria-pressed={instance?.show_semantic_edges ?? false}
        onclick={() =>
          void action_registry.execute(
            ACTION_IDS.search_graph_toggle_semantic,
            tab_id,
          )}
      >
        <Sparkles size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={instance?.show_smart_link_edges
          ? "Hide smart link edges"
          : "Show smart link edges"}
        aria-pressed={instance?.show_smart_link_edges ?? false}
        onclick={() =>
          void action_registry.execute(
            ACTION_IDS.search_graph_toggle_smart_links,
            tab_id,
          )}
      >
        <Link size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Close search graph"
        onclick={close_tab}
      >
        <X size={14} />
      </Button>
    </div>
  </div>

  {#if snapshot}
    <div class="SearchGraphTabView__stats">
      <span>{String(snapshot.stats.hit_count)} hits</span>
      <span>{String(snapshot.stats.neighbor_count)} neighbors</span>
      <span>wiki: {String(snapshot.stats.wiki_edge_count)}</span>
      {#if snapshot.stats.semantic_edge_count > 0}
        <span>semantic: {String(snapshot.stats.semantic_edge_count)}</span>
      {/if}
      {#if snapshot.stats.smart_link_edge_count > 0}
        <span>smart: {String(snapshot.stats.smart_link_edge_count)}</span>
      {/if}
    </div>
  {/if}

  <div class="SearchGraphTabView__body">
    {#if status === "loading"}
      <p class="SearchGraphTabView__message">Searching...</p>
    {:else if status === "error"}
      <p class="SearchGraphTabView__message SearchGraphTabView__message--error">
        {instance?.error ?? "Search failed"}
      </p>
    {:else if snapshot}
      <Resizable.PaneGroup
        direction="horizontal"
        class="SearchGraphTabView__panes"
      >
        <Resizable.Pane defaultSize={40} minSize={20}>
          <SearchGraphCanvas
            {snapshot}
            selected_node_id={instance?.selected_node_id ?? null}
            hovered_node_id={instance?.hovered_node_id ?? null}
            show_semantic_edges={instance?.show_semantic_edges ?? false}
            show_smart_link_edges={instance?.show_smart_link_edges ?? false}
            theme={stores.ui.active_theme}
            on_select_node={(id) => select_node(id)}
            on_hover_node={hover_node}
            on_open_node={open_node}
            on_expand_node={expand_node}
          />
        </Resizable.Pane>
        <Resizable.Handle />
        <Resizable.Pane defaultSize={60} minSize={30}>
          <SearchGraphResultList
            nodes={snapshot.nodes}
            edges={snapshot.edges}
            selected_node_id={instance?.selected_node_id ?? null}
            hovered_node_id={instance?.hovered_node_id ?? null}
            scroll_to_path={instance?.scroll_to_path ?? null}
            on_select={select_node}
            on_hover={hover_node}
            on_open={open_node}
            on_scroll_done={clear_scroll}
          />
        </Resizable.Pane>
      </Resizable.PaneGroup>
    {:else if status === "idle"}
      <p class="SearchGraphTabView__message">
        Enter a query to search and visualize connections
      </p>
    {/if}
  </div>
</div>

<style>
  .SearchGraphTabView {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
  }

  .SearchGraphTabView__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-block-end: 1px solid var(--border);
  }

  .SearchGraphTabView__search {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
    color: var(--muted-foreground);
  }

  .SearchGraphTabView__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .SearchGraphTabView__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding-inline: var(--space-3);
    padding-block: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-block-end: 1px solid var(--border-subtle, var(--border));
  }

  .SearchGraphTabView__body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }

  :global(.SearchGraphTabView__panes) {
    height: 100%;
  }

  .SearchGraphTabView__message {
    margin: 0;
    padding: var(--space-6);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    text-align: center;
  }

  .SearchGraphTabView__message--error {
    color: var(--destructive);
  }
</style>
