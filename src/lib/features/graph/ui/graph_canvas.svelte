<script lang="ts">
  import { resolve_graph_canvas_view } from "$lib/features/graph/domain/graph_canvas_view";
  import type { GraphNeighborhoodSnapshot } from "$lib/features/graph/ports";

  type Props = {
    snapshot: GraphNeighborhoodSnapshot;
    filter_query: string;
    selected_node_ids: string[];
    hovered_node_id: string | null;
    container_width?: number;
    on_select_node: (node_id: string) => void;
    on_hover_node: (node_id: string | null) => void;
    on_open_existing_node: (path: string) => void;
    on_open_orphan_node: (path: string) => void;
  };

  let {
    snapshot,
    filter_query,
    selected_node_ids,
    hovered_node_id,
    container_width,
    on_select_node,
    on_hover_node,
    on_open_existing_node,
    on_open_orphan_node,
  }: Props = $props();

  const view = $derived.by(() =>
    resolve_graph_canvas_view({
      snapshot,
      filter_query,
      selected_node_ids,
      hovered_node_id,
      container_width: container_width ?? 0,
    }),
  );

  function open_node(path: string, existing: boolean) {
    if (existing) {
      on_open_existing_node(path);
      return;
    }

    on_open_orphan_node(path);
  }
</script>

<div class="GraphCanvas" style={`height:${String(view.height)}px;`}>
  <svg
    class="GraphCanvas__edges"
    viewBox={`0 0 ${String(view.width)} ${String(view.height)}`}
    aria-hidden="true"
  >
    {#each view.edges as edge (edge.id)}
      <line
        class="GraphCanvas__edge"
        class:GraphCanvas__edge--dashed={edge.dashed}
        x1={edge.x1}
        y1={edge.y1}
        x2={edge.x2}
        y2={edge.y2}
      />
    {/each}
  </svg>

  {#each view.nodes as node (node.id)}
    <button
      type="button"
      class="GraphCanvas__node"
      class:GraphCanvas__node--selected={node.selected}
      class:GraphCanvas__node--hovered={node.hovered}
      class:GraphCanvas__node--center={node.kind === "center"}
      class:GraphCanvas__node--both={node.kind === "both"}
      class:GraphCanvas__node--orphan={node.kind === "orphan"}
      style={`left:${String(node.x)}px; top:${String(node.y)}px; width:${String(node.width)}px; height:${String(node.height)}px;`}
      onclick={() => on_select_node(node.id)}
      ondblclick={() => open_node(node.path, node.existing)}
      onmouseenter={() => on_hover_node(node.id)}
      onmouseleave={() => on_hover_node(null)}
    >
      <span class="GraphCanvas__label">{node.label}</span>
      {#if node.meta}
        <span class="GraphCanvas__meta">{node.meta}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  .GraphCanvas {
    position: relative;
    margin: 0 auto;
    min-height: 420px;
  }

  .GraphCanvas__edges {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .GraphCanvas__edge {
    stroke: var(--border-strong, var(--border));
    stroke-width: 1.5;
  }

  .GraphCanvas__edge--dashed {
    stroke-dasharray: 6 4;
    opacity: 0.8;
  }

  .GraphCanvas__node {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: var(--space-1);
    padding-inline: var(--space-3);
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--card-foreground);
    text-align: left;
    box-shadow: var(--shadow-sm, none);
  }

  .GraphCanvas__node:hover,
  .GraphCanvas__node:focus-visible {
    border-color: var(--primary);
  }

  .GraphCanvas__node--selected {
    border-color: var(--primary);
    box-shadow: 0 0 0 1px var(--primary);
  }

  .GraphCanvas__node--hovered {
    background: var(--accent);
    color: var(--accent-foreground);
  }

  .GraphCanvas__node--center {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .GraphCanvas__node--both {
    border-style: solid;
    border-width: 2px;
  }

  .GraphCanvas__node--orphan {
    border-style: dashed;
    opacity: 0.9;
  }

  .GraphCanvas__label {
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.2;
  }

  .GraphCanvas__meta {
    font-size: var(--text-xs);
    opacity: 0.8;
    line-height: 1.2;
  }
</style>
