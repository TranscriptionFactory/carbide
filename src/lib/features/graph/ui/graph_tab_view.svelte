<script lang="ts">
  import {
    FolderTree,
    Globe,
    Link,
    RefreshCw,
    Sparkles,
    Target,
  } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { detect_file_type } from "$lib/features/document";
  import { is_linked_note_path } from "$lib/shared/types/note";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import GraphCanvas from "$lib/features/graph/ui/graph_canvas.svelte";
  import VaultGraphCanvas from "$lib/features/graph/ui/vault_graph_canvas.svelte";
  import HierarchyTreeView from "$lib/features/graph/ui/hierarchy_tree_view.svelte";

  const { stores, services, action_registry } = use_app_context();

  const status = $derived(stores.graph.status);
  const snapshot = $derived(stores.graph.snapshot);
  const vault_snapshot = $derived(stores.graph.vault_snapshot);
  const view_mode = $derived(stores.graph.view_mode);
  const filter_query = $derived(stores.graph.filter_query);
  const semantic_edges = $derived(stores.graph.semantic_edges);
  const show_semantic_edges = $derived(stores.graph.show_semantic_edges);
  const smart_link_edges = $derived(stores.graph.smart_link_edges);
  const show_smart_link_edges = $derived(stores.graph.show_smart_link_edges);
  const vault_node_count = $derived(vault_snapshot?.stats.node_count ?? 0);
  const max_vault_size = $derived(
    stores.ui.editor_settings.semantic_graph_max_vault_size,
  );
  const is_vault_mode = $derived(view_mode === "vault");
  const is_hierarchy_mode = $derived(view_mode === "hierarchy");
  const has_snapshot = $derived(snapshot !== null);
  const has_vault_snapshot = $derived(vault_snapshot !== null);

  const has_vault = $derived(stores.vault.vault !== null);

  let container_width = $state<number>(960);
  let container_element = $state<HTMLElement | null>(null);

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

  $effect(() => {
    if (
      has_vault &&
      is_vault_mode &&
      !vault_snapshot &&
      status !== "loading" &&
      status !== "error"
    ) {
      void action_registry.execute(ACTION_IDS.graph_load_vault_graph);
    }
  });

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
        await action_registry.execute(ACTION_IDS.document_open, { file_path });
      }
    } else {
      await action_registry.execute(ACTION_IDS.note_open, path);
    }
  }

  async function open_orphan_node(path: string) {
    await action_registry.execute(ACTION_IDS.note_open_wiki_link, path);
  }
</script>

<div class="GraphTabView">
  <div class="GraphTabView__toolbar">
    <Input
      value={filter_query}
      placeholder="Filter nodes by title or path"
      oninput={(event) =>
        void action_registry.execute(
          ACTION_IDS.graph_set_filter_query,
          event.currentTarget.value,
        )}
    />
    <div class="GraphTabView__actions">
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
          title="Focus active note"
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
        title="Refresh graph"
        onclick={() => void action_registry.execute(ACTION_IDS.graph_refresh)}
      >
        <RefreshCw size={14} />
      </Button>
    </div>
  </div>

  {#if is_vault_mode && vault_snapshot}
    <div class="GraphTabView__stats">
      <span>{String(vault_snapshot.stats.node_count)} notes</span>
      <span>{String(vault_snapshot.stats.edge_count)} links</span>
    </div>
  {:else if !is_vault_mode && !is_hierarchy_mode && snapshot}
    <div class="GraphTabView__stats">
      <span>{String(snapshot.stats.node_count)} nodes</span>
      <span>{String(snapshot.stats.edge_count)} edges</span>
      <span>{String(snapshot.stats.bidirectional_count)} bidirectional</span>
      <span>{String(snapshot.stats.orphan_count)} planned</span>
    </div>
  {/if}

  <div class="GraphTabView__body" bind:this={container_element}>
    {#if is_hierarchy_mode}
      <HierarchyTreeView />
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
        on_open_node={open_node}
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
    {:else if !is_vault_mode && !is_hierarchy_mode && has_snapshot && snapshot}
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
        on_open_existing_node={open_node}
        on_open_orphan_node={open_orphan_node}
      />
    {:else if status === "loading"}
      <p class="GraphTabView__message">
        {is_vault_mode
          ? "Loading vault graph..."
          : is_hierarchy_mode
            ? "Loading hierarchy..."
            : "Loading graph neighborhood..."}
      </p>
    {:else if status === "error"}
      <p class="GraphTabView__message GraphTabView__message--error">
        {stores.graph.error ?? "Graph unavailable"}
      </p>
    {:else}
      <div class="GraphTabView__empty">
        <p class="GraphTabView__message">
          {#if is_vault_mode}
            No vault graph data available.
          {:else}
            Open a note, then focus it in graph to load its neighborhood.
          {/if}
        </p>
        {#if !is_vault_mode && !is_hierarchy_mode}
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
  .GraphTabView {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--background);
  }

  .GraphTabView__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-3);
    border-block-end: 1px solid var(--border);
  }

  .GraphTabView__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .GraphTabView__stats {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
    padding-inline: var(--space-3);
    padding-block: var(--space-2);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    border-block-end: 1px solid var(--border-subtle, var(--border));
  }

  .GraphTabView__body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: auto;
  }

  .GraphTabView__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6);
  }

  .GraphTabView__message {
    margin: 0;
    padding: var(--space-6);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    text-align: center;
  }

  .GraphTabView__message--error {
    color: var(--destructive);
  }
</style>
