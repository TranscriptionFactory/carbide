<script lang="ts">
  import type {
    CanvasEdge,
    CanvasNode,
  } from "$lib/features/canvas/types/canvas";
  import {
    get_edge_endpoints,
    build_edge_path,
    build_arrow_head,
  } from "$lib/features/canvas/domain/canvas_edge_path";

  interface Props {
    edges: CanvasEdge[];
    nodes: CanvasNode[];
  }

  let { edges, nodes }: Props = $props();

  type RenderedEdge = {
    id: string;
    path: string;
    arrow: string | null;
    color: string | null;
    label: string | null;
    label_x: number;
    label_y: number;
  };

  const node_map: Map<string, CanvasNode> = $derived(
    new Map(nodes.map((n) => [n.id, n])),
  );

  const rendered_edges: RenderedEdge[] = $derived(
    edges
      .map((edge) => {
        const endpoints = get_edge_endpoints(edge, node_map);
        if (!endpoints) return null;
        const { from, to } = endpoints;
        const path = build_edge_path(from, to);
        const show_arrow = edge.toEnd !== "none";
        const arrow = show_arrow ? build_arrow_head(to, from) : null;
        return {
          id: edge.id,
          path,
          arrow,
          color: edge.color ?? null,
          label: edge.label ?? null,
          label_x: (from.x + to.x) / 2,
          label_y: (from.y + to.y) / 2,
        };
      })
      .filter((e): e is RenderedEdge => e !== null),
  );
</script>

<svg class="CanvasEdges">
  {#each rendered_edges as edge (edge.id)}
    <path
      d={edge.path}
      class="CanvasEdges__path"
      style:stroke={edge.color
        ? `var(--canvas-color-${edge.color}, ${edge.color})`
        : undefined}
    />
    {#if edge.arrow}
      <path
        d={edge.arrow}
        class="CanvasEdges__arrow"
        style:stroke={edge.color
          ? `var(--canvas-color-${edge.color}, ${edge.color})`
          : undefined}
      />
    {/if}
    {#if edge.label}
      <text x={edge.label_x} y={edge.label_y} class="CanvasEdges__label">
        {edge.label}
      </text>
    {/if}
  {/each}
</svg>

<style>
  .CanvasEdges {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: visible;
  }

  .CanvasEdges__path {
    fill: none;
    stroke: var(--muted-foreground);
    stroke-width: 1.5;
  }

  .CanvasEdges__arrow {
    fill: none;
    stroke: var(--muted-foreground);
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .CanvasEdges__label {
    font-size: 11px;
    fill: var(--muted-foreground);
    text-anchor: middle;
    dominant-baseline: central;
    pointer-events: none;
  }
</style>
