<script lang="ts">
  import type {
    SemanticEdge,
    SmartLinkEdge,
    VaultGraphSnapshot,
  } from "$lib/features/graph/ports";
  import {
    VaultGraphRenderer,
    type EdgeHoverInfo,
  } from "$lib/features/graph/domain/vault_graph_renderer";
  import { matches_filter } from "$lib/features/graph/domain/graph_filter";
  import GraphWorker from "$lib/features/graph/domain/vault_graph_worker?worker&inline";
  import { rule_chip_label } from "$lib/features/smart_links";
  import type { Theme } from "$lib/shared/types/theme";
  import { create_logger } from "$lib/shared/utils/logger";

  const log = create_logger("vault_graph");

  type Props = {
    snapshot: VaultGraphSnapshot;
    filter_query: string;
    filter_override_ids?: Set<string> | null;
    selected_node_ids: string[];
    hovered_node_id: string | null;
    semantic_edges: SemanticEdge[];
    show_semantic_edges: boolean;
    smart_link_edges: SmartLinkEdge[];
    show_smart_link_edges: boolean;
    theme?: Theme;
    on_select_node: (node_id: string) => void;
    on_hover_node: (node_id: string | null) => void;
    on_open_node: (path: string) => void;
    force_params?: {
      link_distance: number;
      charge_strength: number;
      collision_radius: number;
      charge_max_distance: number;
    };
  };

  let {
    snapshot,
    filter_query,
    filter_override_ids = null,
    selected_node_ids,
    hovered_node_id,
    semantic_edges,
    show_semantic_edges,
    smart_link_edges,
    show_smart_link_edges,
    theme,
    on_select_node,
    on_hover_node,
    on_open_node,
    force_params,
  }: Props = $props();

  let renderer = $state<VaultGraphRenderer | null>(null);
  let renderer_ready = $state(false);
  let worker = $state<Worker | null>(null);
  let edge_tooltip = $state<EdgeHoverInfo | null>(null);

  function plain_nodes(snap: VaultGraphSnapshot) {
    return snap.nodes.map((n) => ({ id: n.path, label: n.title }));
  }

  function plain_edges(snap: VaultGraphSnapshot) {
    return snap.edges.map((e) => ({ source: e.source, target: e.target }));
  }

  function compute_filter_set(
    query: string,
    snap: VaultGraphSnapshot,
  ): Set<string> | null {
    const trimmed = query.trim();
    if (!trimmed) return null;
    const set = new Set<string>();
    for (const node of snap.nodes) {
      if (matches_filter(trimmed, node.title, node.path)) {
        set.add(node.path);
      }
    }
    return set;
  }

  function feed_graph(r: VaultGraphRenderer, snap: VaultGraphSnapshot) {
    r.set_graph(plain_nodes(snap), plain_edges(snap));

    if (worker) {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      worker = null;
    }

    const w = new GraphWorker();
    if (renderer !== r) {
      w.terminate();
      return;
    }
    worker = w;
    w.onerror = (event) => {
      log.from_error("Worker error:", event);
    };
    w.onmessage = (event) => {
      const msg = event.data;
      if (msg.type === "positions") {
        const ids: string[] = msg.ids;
        const buffer = new Float64Array(msg.buffer as ArrayBuffer);
        const positions = new Map<string, { x: number; y: number }>();
        for (let i = 0; i < ids.length; i++) {
          positions.set(ids[i]!, {
            x: buffer[i * 2]!,
            y: buffer[i * 2 + 1]!,
          });
        }
        r.update_positions(positions);
      }
    };
    w.postMessage({
      type: "init",
      nodes: snap.nodes.map((n) => ({ id: n.path })),
      edges: plain_edges(snap),
      force_params,
    });
  }

  function cleanup() {
    renderer_ready = false;
    last_snapshot_ref = null;
    if (worker) {
      worker.postMessage({ type: "stop" });
      worker.terminate();
      worker = null;
    }
    if (renderer) {
      renderer.destroy();
      renderer = null;
    }
  }

  function init_canvas(el: HTMLElement) {
    const r = new VaultGraphRenderer();
    renderer = r;

    r.on_node_click = on_select_node;
    r.on_node_hover = on_hover_node;
    r.on_node_dblclick = on_open_node;
    r.on_edge_hover = (info) => {
      edge_tooltip = info;
    };

    const resize_observer = new ResizeObserver(() => {
      if (renderer === r) r.resize();
    });

    r.initialize(el)
      .then(() => {
        if (renderer !== r) return;

        resize_observer.observe(el);
        renderer_ready = true;
      })
      .catch((err) => {
        log.from_error("Init failed:", err);
      });

    return {
      destroy() {
        resize_observer.disconnect();
        cleanup();
      },
    };
  }

  // Re-feed graph data when snapshot changes (e.g. new search query)
  let last_snapshot_ref: VaultGraphSnapshot | null = null;
  $effect(() => {
    if (!renderer_ready || !renderer) return;
    if (snapshot === last_snapshot_ref) return;
    last_snapshot_ref = snapshot;
    feed_graph(renderer, snapshot);
  });

  $effect(() => {
    renderer?.set_filter(
      filter_override_ids ?? compute_filter_set(filter_query, snapshot),
    );
  });

  $effect(() => {
    // Re-read colors and re-render when theme object changes
    if (theme) {
      renderer?.update_colors();
    }
  });

  $effect(() => {
    if (selected_node_ids.length > 0) {
      renderer?.select_node(selected_node_ids[0] ?? null);
    } else {
      renderer?.select_node(null);
    }
  });

  $effect(() => {
    renderer?.highlight_node(hovered_node_id);
  });

  $effect(() => {
    renderer?.set_semantic_edges(
      semantic_edges.map((e) => ({
        source: e.source,
        target: e.target,
        distance: e.distance,
      })),
      show_semantic_edges,
    );
  });

  $effect(() => {
    renderer?.set_smart_link_edges(smart_link_edges, show_smart_link_edges);
  });

  function format_tooltip(info: EdgeHoverInfo): string {
    const parts = info.rules.map(
      (r) =>
        `${rule_chip_label(r.rule_id)} ${String(Math.round(r.raw_score * 100))}%`,
    );
    return `Score: ${String(Math.round(info.score * 100))}% — ${parts.join(", ")}`;
  }
</script>

<div class="VaultGraph" role="img" aria-label="Full vault graph">
  <div class="VaultGraph__canvas" use:init_canvas></div>

  {#if snapshot.stats.node_count > 5000}
    <div class="VaultGraph__warning">
      Large vault ({String(snapshot.stats.node_count)} notes) — graph may be slow
    </div>
  {/if}

  {#if snapshot.stats.node_count === 0}
    <div class="VaultGraph__empty">No notes in vault</div>
  {/if}

  {#if edge_tooltip}
    <div
      class="VaultGraph__tooltip"
      style="left:{String(edge_tooltip.screen_x + 12)}px;top:{String(
        edge_tooltip.screen_y - 8,
      )}px;"
    >
      {format_tooltip(edge_tooltip)}
    </div>
  {/if}
</div>

<style>
  .VaultGraph {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .VaultGraph__canvas {
    position: absolute;
    inset: 0;
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
    z-index: 1;
    pointer-events: none;
  }

  .VaultGraph__empty {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    z-index: 1;
  }

  .VaultGraph__tooltip {
    position: absolute;
    z-index: 10;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius);
    background: var(--popover);
    color: var(--popover-foreground);
    font-size: var(--text-xs);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm, none);
    pointer-events: none;
    white-space: nowrap;
  }
</style>
