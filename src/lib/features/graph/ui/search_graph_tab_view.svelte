<script lang="ts">
  import {
    LayoutGrid,
    Maximize2,
    Minimize2,
    Search,
    Sparkles,
    Link,
    X,
  } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { is_linked_note_path } from "$lib/shared/types/note";
  import type { SearchGraphSortMode } from "$lib/features/graph/domain/sort_search_graph_nodes";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import * as Resizable from "$lib/components/ui/resizable/index.js";
  import { toast } from "svelte-sonner";
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

  function open_node(path: string) {
    void action_registry.execute(ACTION_IDS.note_open, path);
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

  let last_clicked_path = $state<string | null>(null);
  let list_pane = $state<{
    collapse: () => void;
    expand: () => void;
    isCollapsed: () => boolean;
  } | null>(null);
  const graph_expanded = $derived(instance?.graph_expanded ?? false);

  $effect(() => {
    if (!list_pane) return;
    if (graph_expanded && !list_pane.isCollapsed()) {
      list_pane.collapse();
    } else if (!graph_expanded && list_pane.isCollapsed()) {
      list_pane.expand();
    }
  });

  function handle_toggle_select(
    path: string,
    shift_key: boolean,
    ordered_paths: string[],
  ) {
    if (!path) {
      stores.search_graph.clear_selected(tab_id);
      return;
    }
    if (shift_key && last_clicked_path) {
      stores.search_graph.select_range(
        tab_id,
        last_clicked_path,
        path,
        ordered_paths,
      );
    } else {
      stores.search_graph.toggle_selected(tab_id, path);
    }
    last_clicked_path = path;
  }

  function handle_set_min_score(score: number) {
    stores.search_graph.set_min_score(tab_id, score);
  }

  function handle_toggle_neighbors() {
    stores.search_graph.toggle_neighbors(tab_id);
  }

  function handle_set_sort_mode(mode: SearchGraphSortMode) {
    void action_registry.execute(ACTION_IDS.search_graph_set_sort_mode, {
      tab_id,
      sort_mode: mode,
    });
  }

  function handle_toggle_sort_order() {
    void action_registry.execute(
      ACTION_IDS.search_graph_toggle_sort_order,
      tab_id,
    );
  }

  function open_to_side(path: string) {
    void action_registry.execute(ACTION_IDS.tab_open_to_side, path);
  }

  function find_similar(path: string) {
    expand_node(path);
  }

  async function resolve_absolute_path(path: string): Promise<string | null> {
    if (path.startsWith("/")) return path;
    const resolved = await resolve_file_path(path);
    if (resolved && resolved.startsWith("/")) return resolved;
    const vault_path = stores.vault.vault?.path;
    return vault_path ? `${vault_path}/${path}` : null;
  }

  async function copy_path(path: string) {
    const absolute = await resolve_absolute_path(path);
    if (!absolute) return;
    try {
      await navigator.clipboard.writeText(absolute);
      toast.success("Path copied");
    } catch {
      toast.error("Failed to copy path");
    }
  }

  async function reveal_in_file_manager(path: string) {
    const absolute = await resolve_absolute_path(path);
    if (absolute) void services.shell.reveal_in_file_manager(absolute);
  }

  async function open_in_default_app(path: string) {
    const absolute = await resolve_absolute_path(path);
    if (absolute) void services.shell.open_path(absolute);
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
      {#if snapshot}
        <Button
          variant="ghost"
          size="icon"
          title={graph_expanded ? "Show result list" : "Expand graph"}
          aria-pressed={graph_expanded}
          onclick={() =>
            stores.search_graph.set_graph_expanded(tab_id, !graph_expanded)}
        >
          {#if graph_expanded}
            <Minimize2 size={14} />
          {:else}
            <Maximize2 size={14} />
          {/if}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Export as canvas"
          onclick={() =>
            void action_registry.execute(
              ACTION_IDS.canvas_export_search_graph_as_canvas,
              tab_id,
            )}
        >
          <LayoutGrid size={14} />
        </Button>
      {/if}
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
      {#if (instance?.selected_node_ids.size ?? 0) > 0}
        <span class="SearchGraphTabView__selection-count">
          {String(instance?.selected_node_ids.size)} selected
        </span>
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
            selected_node_ids={instance?.selected_node_ids ?? new Set()}
            hovered_node_id={instance?.hovered_node_id ?? null}
            show_semantic_edges={instance?.show_semantic_edges ?? false}
            show_smart_link_edges={instance?.show_smart_link_edges ?? false}
            show_neighbors={instance?.show_neighbors ?? true}
            min_score={instance?.min_score ?? 0}
            theme={stores.ui.active_theme}
            on_select_node={(id) => select_node(id)}
            on_hover_node={hover_node}
            on_open_node={open_node}
            on_expand_node={expand_node}
          />
        </Resizable.Pane>
        <Resizable.Handle />
        <Resizable.Pane
          bind:this={list_pane}
          defaultSize={60}
          minSize={30}
          collapsible
          collapsedSize={0}
          onCollapse={() =>
            stores.search_graph.set_graph_expanded(tab_id, true)}
          onExpand={() => stores.search_graph.set_graph_expanded(tab_id, false)}
        >
          <SearchGraphResultList
            nodes={snapshot.nodes}
            edges={snapshot.edges}
            selected_node_id={instance?.selected_node_id ?? null}
            selected_node_ids={instance?.selected_node_ids ?? new Set()}
            hovered_node_id={instance?.hovered_node_id ?? null}
            scroll_to_path={instance?.scroll_to_path ?? null}
            show_neighbors={instance?.show_neighbors ?? true}
            min_score={instance?.min_score ?? 0}
            sort_mode={instance?.sort_mode ?? "relevance"}
            sort_ascending={instance?.sort_ascending ?? false}
            on_select={select_node}
            on_hover={hover_node}
            on_open={open_node}
            on_scroll_done={clear_scroll}
            on_toggle_select={handle_toggle_select}
            on_set_min_score={handle_set_min_score}
            on_toggle_neighbors={handle_toggle_neighbors}
            on_set_sort_mode={handle_set_sort_mode}
            on_toggle_sort_order={handle_toggle_sort_order}
            on_open_to_side={open_to_side}
            on_copy_path={copy_path}
            on_reveal_in_file_manager={reveal_in_file_manager}
            on_open_in_default_app={open_in_default_app}
            on_find_similar={find_similar}
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

  .SearchGraphTabView__selection-count {
    color: var(--primary);
    font-weight: 500;
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
