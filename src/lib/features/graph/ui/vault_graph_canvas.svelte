<script lang="ts">
  import type { VaultGraphSnapshot } from "$lib/features/graph/ports";
  import {
    create_vault_graph_simulation,
    resolve_vault_graph_view,
    stabilize_simulation,
    type VaultGraphSimulationState,
  } from "$lib/features/graph/domain/vault_graph_layout";

  type Props = {
    snapshot: VaultGraphSnapshot;
    filter_query: string;
    selected_node_ids: string[];
    hovered_node_id: string | null;
    on_select_node: (node_id: string) => void;
    on_hover_node: (node_id: string | null) => void;
    on_open_node: (path: string) => void;
  };

  let {
    snapshot,
    filter_query,
    selected_node_ids,
    hovered_node_id,
    on_select_node,
    on_hover_node,
    on_open_node,
  }: Props = $props();

  let sim_state = $state<VaultGraphSimulationState | null>(null);
  let transform = $state({ x: 0, y: 0, scale: 1 });
  let container_el = $state<HTMLElement | null>(null);
  let dragging = $state(false);
  let drag_start = $state({ x: 0, y: 0, tx: 0, ty: 0 });

  $effect(() => {
    const state = create_vault_graph_simulation(snapshot);
    stabilize_simulation(state);
    sim_state = state;

    const cx = container_el?.clientWidth ? container_el.clientWidth / 2 : 400;
    const cy = container_el?.clientHeight ? container_el.clientHeight / 2 : 300;
    transform = { x: cx, y: cy, scale: 1 };
  });

  const view = $derived.by(() => {
    if (!sim_state) return { nodes: [], edges: [] };
    return resolve_vault_graph_view({
      state: sim_state,
      filter_query,
      selected_node_ids,
      hovered_node_id,
    });
  });

  function on_wheel(event: WheelEvent) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 0.9 : 1.1;
    const next_scale = Math.min(4, Math.max(0.1, transform.scale * factor));

    const rect = container_el?.getBoundingClientRect();
    if (!rect) {
      transform = { ...transform, scale: next_scale };
      return;
    }

    const mx = event.clientX - rect.left;
    const my = event.clientY - rect.top;

    transform = {
      x: mx - ((mx - transform.x) / transform.scale) * next_scale,
      y: my - ((my - transform.y) / transform.scale) * next_scale,
      scale: next_scale,
    };
  }

  function on_pointer_down(event: PointerEvent) {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest(".VaultGraph__node")) return;

    dragging = true;
    drag_start = {
      x: event.clientX,
      y: event.clientY,
      tx: transform.x,
      ty: transform.y,
    };
    container_el?.setPointerCapture(event.pointerId);
  }

  function on_pointer_move(event: PointerEvent) {
    if (!dragging) return;
    transform = {
      ...transform,
      x: drag_start.tx + (event.clientX - drag_start.x),
      y: drag_start.ty + (event.clientY - drag_start.y),
    };
  }

  function on_pointer_up(event: PointerEvent) {
    if (!dragging) return;
    dragging = false;
    container_el?.releasePointerCapture(event.pointerId);
  }

  const transform_str = $derived(
    `translate(${String(transform.x)}px, ${String(transform.y)}px) scale(${String(transform.scale)})`,
  );
</script>

<div
  class="VaultGraph"
  bind:this={container_el}
  onwheel={on_wheel}
  onpointerdown={on_pointer_down}
  onpointermove={on_pointer_move}
  onpointerup={on_pointer_up}
  role="img"
  aria-label="Full vault graph"
>
  <div class="VaultGraph__viewport" style:transform={transform_str}>
    <svg class="VaultGraph__edges" aria-hidden="true">
      {#each view.edges as edge (edge.id)}
        <line
          class="VaultGraph__edge"
          class:VaultGraph__edge--dimmed={edge.dimmed}
          class:VaultGraph__edge--highlighted={edge.highlighted}
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
        class="VaultGraph__node"
        class:VaultGraph__node--selected={node.selected}
        class:VaultGraph__node--hovered={node.hovered}
        class:VaultGraph__node--dimmed={node.dimmed}
        class:VaultGraph__node--connected={node.connected_to_hovered}
        style={`left:${String(node.x)}px; top:${String(node.y)}px;`}
        onclick={() => on_select_node(node.id)}
        ondblclick={() => on_open_node(node.id)}
        onmouseenter={() => on_hover_node(node.id)}
        onmouseleave={() => on_hover_node(null)}
      >
        <span class="VaultGraph__dot"></span>
        <span class="VaultGraph__label">{node.label}</span>
      </button>
    {/each}
  </div>

  {#if snapshot.stats.node_count > 5000}
    <div class="VaultGraph__warning">
      Large vault ({String(snapshot.stats.node_count)} notes) — graph may be slow
    </div>
  {/if}

  {#if snapshot.stats.node_count === 0}
    <div class="VaultGraph__empty">No notes in vault</div>
  {/if}
</div>

<style>
  .VaultGraph {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
  }

  .VaultGraph:active {
    cursor: grabbing;
  }

  .VaultGraph__viewport {
    position: absolute;
    transform-origin: 0 0;
  }

  .VaultGraph__edges {
    position: absolute;
    overflow: visible;
    width: 0;
    height: 0;
  }

  .VaultGraph__edge {
    stroke: var(--border-strong, var(--border));
    stroke-width: 1;
    opacity: 0.4;
  }

  .VaultGraph__edge--dimmed {
    opacity: 0.08;
  }

  .VaultGraph__edge--highlighted {
    stroke: var(--primary);
    stroke-width: 1.5;
    opacity: 0.9;
  }

  .VaultGraph__node {
    position: absolute;
    width: 20px;
    height: 20px;
    margin-left: -10px;
    margin-top: -10px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
  }

  .VaultGraph__node:hover .VaultGraph__dot,
  .VaultGraph__node:focus-visible .VaultGraph__dot {
    background: var(--primary);
    transform: scale(1.5);
  }

  .VaultGraph__label {
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 4px;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--foreground);
    background: var(--background);
    padding: 2px 6px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  .VaultGraph__node:hover .VaultGraph__label,
  .VaultGraph__node--hovered .VaultGraph__label,
  .VaultGraph__node--selected .VaultGraph__label {
    opacity: 1;
  }

  .VaultGraph__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted-foreground);
    transition:
      transform 0.15s ease,
      background 0.15s ease,
      opacity 0.15s ease;
  }

  .VaultGraph__node--selected .VaultGraph__dot {
    background: var(--primary);
    transform: scale(1.8);
    box-shadow: 0 0 0 2px var(--primary);
  }

  .VaultGraph__node--hovered .VaultGraph__dot {
    background: var(--primary);
    transform: scale(1.8);
  }

  .VaultGraph__node--dimmed .VaultGraph__dot {
    opacity: 0.15;
  }

  .VaultGraph__node--connected .VaultGraph__dot {
    background: var(--primary);
    opacity: 1;
  }

  .VaultGraph__warning {
    position: absolute;
    bottom: var(--space-2);
    left: var(--space-2);
    font-size: var(--text-xs);
    color: var(--destructive);
    background: var(--background);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .VaultGraph__empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
