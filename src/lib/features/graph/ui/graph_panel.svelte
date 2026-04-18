<script lang="ts">
  import {
    Globe,
    FolderTree,
    Link,
    Maximize2,
    RefreshCw,
    Search,
    Sparkles,
    Target,
  } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import GraphCanvas from "$lib/features/graph/ui/graph_canvas.svelte";
  import VaultGraphCanvas from "$lib/features/graph/ui/vault_graph_canvas.svelte";
  import HierarchyTreeView from "$lib/features/graph/ui/hierarchy_tree_view.svelte";

  const { stores, action_registry } = use_app_context();

  const status = $derived(stores.graph.status);
  const snapshot = $derived(stores.graph.snapshot);
  const vault_snapshot = $derived(stores.graph.vault_snapshot);
  const view_mode = $derived(stores.graph.view_mode);
  const error = $derived(stores.graph.error);
  const filter_query = $derived(stores.graph.filter_query);
  const has_snapshot = $derived(snapshot !== null);
  const has_vault_snapshot = $derived(vault_snapshot !== null);
  const is_vault_mode = $derived(view_mode === "vault");
  const is_hierarchy_mode = $derived(view_mode === "hierarchy");
  const semantic_edges = $derived(stores.graph.semantic_edges);
  const show_semantic_edges = $derived(stores.graph.show_semantic_edges);
  const smart_link_edges = $derived(stores.graph.smart_link_edges);
  const show_smart_link_edges = $derived(stores.graph.show_smart_link_edges);
  const vault_node_count = $derived(vault_snapshot?.stats.node_count ?? 0);
  const max_vault_size = $derived(
    stores.ui.editor_settings.semantic_graph_max_vault_size,
  );
  const graph_tab_active = $derived(stores.tab.active_tab?.kind === "graph");

  let container_element = $state<HTMLElement | null>(null);
  let container_width = $state<number>(760);

  $effect(() => {
    if (!container_element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.contentRect.width > 0) {
          container_width = entry.contentRect.width;
        }
      }
    });

    observer.observe(container_element);
    return () => observer.disconnect();
  });

  async function open_existing_node(path: string) {
    await action_registry.execute(ACTION_IDS.note_open, path);
    await action_registry.execute(ACTION_IDS.graph_focus_active_note);
  }

  async function open_orphan_node(path: string) {
    await action_registry.execute(ACTION_IDS.note_open_wiki_link, path);
    await action_registry.execute(ACTION_IDS.graph_focus_active_note);
  }
</script>

<div class="GraphPanel">
  <div class="GraphPanel__header">
    <div class="GraphPanel__title_group">
      {#if is_vault_mode}
        <h2 class="GraphPanel__title">Full vault</h2>
      {:else if is_hierarchy_mode}
        <h2 class="GraphPanel__title">Hierarchy</h2>
      {:else if snapshot}
        <h2 class="GraphPanel__title">{snapshot.center.title}</h2>
      {:else}
        <h2 class="GraphPanel__title">Neighborhood</h2>
      {/if}
    </div>

    <div class="GraphPanel__actions">
      <Button
        variant="ghost"
        size="icon"
        title={is_vault_mode
          ? "Switch to hierarchy (IWE)"
          : is_hierarchy_mode
            ? "Switch to neighborhood"
            : "Switch to full vault"}
        onclick={() =>
          void action_registry.execute(ACTION_IDS.graph_toggle_view_mode)}
      >
        {#if is_hierarchy_mode}
          <FolderTree size={14} />
        {:else}
          <Globe size={14} />
        {/if}
      </Button>
      {#if !is_vault_mode && !is_hierarchy_mode}
        <Button
          variant="ghost"
          size="icon"
          onclick={() =>
            void action_registry.execute(ACTION_IDS.graph_focus_active_note)}
        >
          <Target size={14} />
        </Button>
      {/if}
      <Button
        variant="ghost"
        size="icon"
        title={show_semantic_edges
          ? "Hide semantic connections"
          : "Show semantic connections"}
        aria-pressed={show_semantic_edges}
        disabled={vault_node_count === 0 || vault_node_count > max_vault_size}
        onclick={() =>
          void action_registry.execute(ACTION_IDS.graph_toggle_semantic_edges)}
      >
        <Sparkles size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title={show_smart_link_edges
          ? "Hide smart link connections"
          : "Show smart link connections"}
        aria-pressed={show_smart_link_edges}
        disabled={vault_node_count === 0 || vault_node_count > max_vault_size}
        onclick={() =>
          void action_registry.execute(
            ACTION_IDS.graph_toggle_smart_link_edges,
          )}
      >
        <Link size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Search graph"
        onclick={() =>
          void action_registry.execute(ACTION_IDS.search_graph_open)}
      >
        <Search size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        title="Open graph in tab"
        onclick={() =>
          void action_registry.execute(ACTION_IDS.graph_open_as_tab)}
      >
        <Maximize2 size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => void action_registry.execute(ACTION_IDS.graph_refresh)}
      >
        <RefreshCw size={14} />
      </Button>
    </div>
  </div>

  <div class="GraphPanel__toolbar">
    <Input
      value={filter_query}
      placeholder="Filter nodes by title or path"
      oninput={(event) =>
        void action_registry.execute(
          ACTION_IDS.graph_set_filter_query,
          event.currentTarget.value,
        )}
    />
  </div>

  {#if is_vault_mode && vault_snapshot}
    <div class="GraphPanel__stats">
      <span>{String(vault_snapshot.stats.node_count)} notes</span>
      <span>{String(vault_snapshot.stats.edge_count)} links</span>
    </div>
  {:else if snapshot}
    <div class="GraphPanel__stats">
      <span>{String(snapshot.stats.node_count)} nodes</span>
      <span>{String(snapshot.stats.edge_count)} edges</span>
      <span>{String(snapshot.stats.bidirectional_count)} bidirectional</span>
      <span>{String(snapshot.stats.orphan_count)} planned</span>
    </div>
  {/if}

  <div class="GraphPanel__body" bind:this={container_element}>
    {#if is_hierarchy_mode}
      <HierarchyTreeView />
    {:else if graph_tab_active && is_vault_mode}
      <p class="GraphPanel__message">Vault graph is open in a tab.</p>
    {:else if is_vault_mode && has_vault_snapshot && vault_snapshot}
      <VaultGraphCanvas
        snapshot={vault_snapshot}
        {filter_query}
        selected_node_ids={stores.graph.selected_node_ids}
        hovered_node_id={stores.graph.hovered_node_id}
        {semantic_edges}
        {show_semantic_edges}
        {smart_link_edges}
        {show_smart_link_edges}
        theme={stores.ui.active_theme}
        on_select_node={(node_id) =>
          void action_registry.execute(ACTION_IDS.graph_select_node, node_id)}
        on_hover_node={(node_id) =>
          void action_registry.execute(
            ACTION_IDS.graph_set_hovered_node,
            node_id,
          )}
        on_open_node={open_existing_node}
        force_params={{
          link_distance: stores.ui.editor_settings.graph_force_link_distance,
          charge_strength:
            stores.ui.editor_settings.graph_force_charge_strength,
          collision_radius:
            stores.ui.editor_settings.graph_force_collision_radius,
          charge_max_distance:
            stores.ui.editor_settings.graph_force_charge_max_distance,
        }}
      />
    {:else if !is_vault_mode && has_snapshot && snapshot}
      <GraphCanvas
        {snapshot}
        {filter_query}
        {container_width}
        selected_node_ids={stores.graph.selected_node_ids}
        hovered_node_id={stores.graph.hovered_node_id}
        on_select_node={(node_id) =>
          void action_registry.execute(ACTION_IDS.graph_select_node, node_id)}
        on_hover_node={(node_id) =>
          void action_registry.execute(
            ACTION_IDS.graph_set_hovered_node,
            node_id,
          )}
        on_open_existing_node={open_existing_node}
        on_open_orphan_node={open_orphan_node}
      />
    {:else if status === "loading"}
      <p class="GraphPanel__message">
        {is_vault_mode
          ? "Loading vault graph..."
          : "Loading graph neighborhood..."}
      </p>
    {:else if status === "error"}
      <p class="GraphPanel__message GraphPanel__message--error">
        {error ?? "Graph unavailable"}
      </p>
    {:else}
      <div class="GraphPanel__empty">
        <p class="GraphPanel__message">
          {#if is_vault_mode}
            Switch to full vault view to see all notes and their connections.
          {:else}
            Open a note, then focus it in graph to load its neighborhood.
          {/if}
        </p>
        {#if !is_vault_mode}
          <Button
            variant="outline"
            onclick={() =>
              void action_registry.execute(ACTION_IDS.graph_focus_active_note)}
          >
            Focus active note
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .GraphPanel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
  }

  .GraphPanel__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-3);
    border-block-end: 1px solid var(--border);
  }

  .GraphPanel__title_group {
    min-width: 0;
  }

  .GraphPanel__title {
    font-size: var(--text-sm);
    font-weight: 700;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .GraphPanel__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .GraphPanel__toolbar {
    padding: var(--space-3);
    border-block-end: 1px solid var(--border-subtle, var(--border));
  }

  .GraphPanel__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding-inline: var(--space-3);
    padding-block: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-block-end: 1px solid var(--border-subtle, var(--border));
  }

  .GraphPanel__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--space-3);
  }

  .GraphPanel__empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .GraphPanel__message {
    margin: 0;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .GraphPanel__message--error {
    color: var(--destructive);
  }
</style>
