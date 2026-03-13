<script lang="ts">
  import { RefreshCw, Target, X, ArrowLeftRight } from "@lucide/svelte";
  import { ACTION_IDS } from "$lib/app";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import GraphCanvas from "$lib/features/graph/ui/graph_canvas.svelte";

  const { stores, action_registry } = use_app_context();

  const status = $derived(stores.graph.status);
  const snapshot = $derived(stores.graph.snapshot);
  const error = $derived(stores.graph.error);
  const filter_query = $derived(stores.graph.filter_query);
  const has_snapshot = $derived(snapshot !== null);

  async function open_existing_node(path: string) {
    await action_registry.execute(ACTION_IDS.note_open, path);
    await action_registry.execute(ACTION_IDS.graph_focus_active_note);
  }

  async function open_orphan_node(path: string) {
    await action_registry.execute(ACTION_IDS.note_open_wiki_link, path);
    await action_registry.execute(ACTION_IDS.graph_focus_active_note);
  }

  function toggle_side() {
    const { services } = use_app_context();
    const current_side = stores.ui.editor_settings.graph_panel_side;
    const next_side = current_side === "left" ? "right" : "left";
    void services.settings.update_settings({
      ...stores.ui.editor_settings,
      graph_panel_side: next_side,
    });
  }
</script>

<div class="GraphPanel">
  <div class="GraphPanel__header">
    <div class="GraphPanel__title_group">
      <h2 class="GraphPanel__title">Graph</h2>
      {#if snapshot}
        <p class="GraphPanel__subtitle">{snapshot.center.title}</p>
      {/if}
    </div>

    <div class="GraphPanel__actions">
      <Button
        variant="ghost"
        size="icon"
        onclick={toggle_side}
        title="Move to other side"
      >
        <ArrowLeftRight size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => void action_registry.execute(ACTION_IDS.graph_focus_active_note)}
      >
        <Target size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => void action_registry.execute(ACTION_IDS.graph_refresh)}
      >
        <RefreshCw size={14} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        onclick={() => void action_registry.execute(ACTION_IDS.graph_close)}
      >
        <X size={14} />
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

  {#if snapshot}
    <div class="GraphPanel__stats">
      <span>{String(snapshot.stats.node_count)} nodes</span>
      <span>{String(snapshot.stats.edge_count)} edges</span>
      <span>{String(snapshot.stats.bidirectional_count)} bidirectional</span>
      <span>{String(snapshot.stats.orphan_count)} planned</span>
    </div>
  {/if}

  <div class="GraphPanel__body">
    {#if status === "loading"}
      <p class="GraphPanel__message">Loading graph neighborhood...</p>
    {:else if status === "error"}
      <p class="GraphPanel__message GraphPanel__message--error">
        {error ?? "Graph unavailable"}
      </p>
    {:else if has_snapshot && snapshot}
      <GraphCanvas
        {snapshot}
        {filter_query}
        selected_node_ids={stores.graph.selected_node_ids}
        hovered_node_id={stores.graph.hovered_node_id}
        on_select_node={(node_id) =>
          void action_registry.execute(ACTION_IDS.graph_select_node, node_id)}
        on_hover_node={(node_id) =>
          void action_registry.execute(ACTION_IDS.graph_set_hovered_node, node_id)}
        on_open_existing_node={open_existing_node}
        on_open_orphan_node={open_orphan_node}
      />
    {:else}
      <div class="GraphPanel__empty">
        <p class="GraphPanel__message">
          Open a note, then focus it in graph to load its neighborhood.
        </p>
        <Button
          variant="outline"
          onclick={() => void action_registry.execute(ACTION_IDS.graph_focus_active_note)}
        >
          Focus active note
        </Button>
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
  }

  .GraphPanel__subtitle {
    margin: 0;
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .GraphPanel__actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
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
