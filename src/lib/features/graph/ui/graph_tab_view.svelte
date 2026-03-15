<script lang="ts">
  import { RefreshCw, Sparkles } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import VaultGraphCanvas from "$lib/features/graph/ui/vault_graph_canvas.svelte";

  const { stores, action_registry } = use_app_context();

  const status = $derived(stores.graph.status);
  const vault_snapshot = $derived(stores.graph.vault_snapshot);
  const filter_query = $derived(stores.graph.filter_query);
  const semantic_edges = $derived(stores.graph.semantic_edges);
  const show_semantic_edges = $derived(stores.graph.show_semantic_edges);
  const vault_node_count = $derived(vault_snapshot?.stats.node_count ?? 0);
  const max_vault_size = $derived(
    stores.ui.editor_settings.semantic_graph_max_vault_size,
  );

  $effect(() => {
    if (!vault_snapshot && status !== "loading") {
      void action_registry.execute(ACTION_IDS.graph_load_vault_graph);
    }
  });

  async function open_node(path: string) {
    await action_registry.execute(ACTION_IDS.note_open, path);
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
      {#if vault_node_count > 0 && vault_node_count <= max_vault_size}
        <Button
          variant="ghost"
          size="icon"
          title={show_semantic_edges
            ? "Hide semantic connections"
            : "Show semantic connections"}
          aria-pressed={show_semantic_edges}
          onclick={() =>
            void action_registry.execute(
              ACTION_IDS.graph_toggle_semantic_edges,
            )}
        >
          <Sparkles size={14} />
        </Button>
      {/if}
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

  {#if vault_snapshot}
    <div class="GraphTabView__stats">
      <span>{String(vault_snapshot.stats.node_count)} notes</span>
      <span>{String(vault_snapshot.stats.edge_count)} links</span>
    </div>
  {/if}

  <div class="GraphTabView__body">
    {#if status === "loading"}
      <p class="GraphTabView__message">Loading vault graph...</p>
    {:else if status === "error"}
      <p class="GraphTabView__message GraphTabView__message--error">
        {stores.graph.error ?? "Graph unavailable"}
      </p>
    {:else if vault_snapshot}
      <VaultGraphCanvas
        snapshot={vault_snapshot}
        {filter_query}
        selected_node_ids={stores.graph.selected_node_ids}
        hovered_node_id={stores.graph.hovered_node_id}
        {semantic_edges}
        {show_semantic_edges}
        on_select_node={(node_id) =>
          void action_registry.execute(ACTION_IDS.graph_select_node, node_id)}
        on_hover_node={(node_id) =>
          void action_registry.execute(
            ACTION_IDS.graph_set_hovered_node,
            node_id,
          )}
        on_open_node={open_node}
      />
    {:else}
      <p class="GraphTabView__message">No vault graph data available.</p>
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
