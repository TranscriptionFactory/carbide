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
  import { compute_degradation_profile } from "$lib/features/graph/domain/graph_degrade";
  import { matches_filter } from "$lib/features/graph/domain/graph_filter";
  import { radial_layout } from "$lib/features/graph/domain/radial_layout";
  import GraphWorker from "$lib/features/graph/domain/vault_graph_worker?worker&inline";
  import { rule_chip_label } from "$lib/features/smart_links";
  import type { Theme } from "$lib/shared/types/theme";
  import { create_logger } from "$lib/shared/utils/logger";

  const log = create_logger("vault_graph");

  import type { GraphGroupMode } from "$lib/features/graph/state/graph_store.svelte";

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
    group_mode?: GraphGroupMode;
    on_select_node: (node_id: string) => void;
    on_hover_node: (node_id: string | null) => void;
    on_open_node: (path: string) => void;
    on_dblclick_node?: ((path: string) => void) | undefined;
    on_expand_node?: ((path: string) => void) | undefined;
    on_export_canvas?: (() => void) | undefined;
    on_clusters_computed?:
      | ((assignments: Record<string, number>) => void)
      | undefined;
    focus_node_path?: string | null;
    on_exit_focus?: (() => void) | undefined;
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
    on_dblclick_node,
    on_expand_node,
    on_export_canvas,
    on_clusters_computed,
    group_mode = "folder",
    focus_node_path = null,
    on_exit_focus,
    force_params,
  }: Props = $props();

  let container_el = $state<HTMLDivElement | null>(null);
  let renderer = $state<VaultGraphRenderer | null>(null);
  let renderer_ready = $state(false);
  let worker = $state<Worker | null>(null);
  let edge_tooltip = $state<EdgeHoverInfo | null>(null);
  let pending_fit = false;

  let context_menu = $state<{
    node_id: string;
    x: number;
    y: number;
  } | null>(null);

  function close_context_menu() {
    context_menu = null;
  }

  function plain_nodes(snap: VaultGraphSnapshot) {
    return snap.nodes.map((n) => {
      const base: {
        id: string;
        label: string;
        kind?: "hit" | "neighbor";
        score?: number;
        group?: string;
      } = {
        id: n.path,
        label: n.title,
      };
      if (n.kind != null) base.kind = n.kind;
      if (n.score != null) base.score = n.score;
      if (n.group != null) base.group = n.group;
      return base;
    });
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
    const edges = plain_edges(snap);
    r.set_graph(plain_nodes(snap), edges);
    pending_fit = true;

    const profile = compute_degradation_profile(
      snap.nodes.length,
      edges.length,
    );

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
        if (pending_fit) {
          pending_fit = false;
          r.fit_to_content();
        }
      } else if (msg.type === "clusters" && on_clusters_computed) {
        on_clusters_computed(msg.assignments as Record<string, number>);
      }
    };
    if (profile.is_degraded) {
      w.postMessage({
        type: "tick_budget",
        ticks: profile.simulation_tick_cap,
      });
    }
    const has_search_meta = snap.nodes.some((n) => n.kind != null);
    w.postMessage({
      type: "init",
      nodes: snap.nodes.map((n) => ({
        id: n.path,
        kind: n.kind,
        group: n.group,
        label_len: n.title.length,
      })),
      edges,
      force_params,
      compute_clusters: group_mode === "cluster",
      grouping: has_search_meta
        ? {
            mode: "both" as const,
            folder_strength: 0.3,
            hit_center_strength: 0.15,
          }
        : undefined,
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

    r.on_node_click = (id) => {
      close_context_menu();
      on_select_node(id);
    };
    r.on_node_hover = on_hover_node;
    r.on_node_dblclick = on_dblclick_node ?? on_open_node;
    r.on_node_contextmenu = (id, sx, sy) => {
      context_menu = { node_id: id, x: sx, y: sy };
    };
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
  let last_group_mode: GraphGroupMode | null = null;
  $effect(() => {
    if (!renderer_ready || !renderer) return;
    if (snapshot === last_snapshot_ref) return;
    last_snapshot_ref = snapshot;
    last_group_mode = group_mode;
    feed_graph(renderer, snapshot);
  });

  $effect(() => {
    if (!renderer_ready || !renderer || !last_snapshot_ref) return;
    if (group_mode === last_group_mode) return;
    last_group_mode = group_mode;
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
    if (selected_node_ids.length > 1) {
      renderer?.select_nodes(new Set(selected_node_ids));
    } else if (selected_node_ids.length === 1) {
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

  $effect(() => {
    if (!renderer_ready || !renderer) return;
    if (focus_node_path) {
      const result = radial_layout(focus_node_path, plain_edges(snapshot));
      const focus_set = new Set<string>([focus_node_path]);
      for (const id of result.neighbor_ids_1hop) focus_set.add(id);
      for (const id of result.neighbor_ids_2hop) focus_set.add(id);
      renderer.set_filter(focus_set);
      renderer.animate_to_positions(result.positions, 400);

      const edge_labels: Array<{
        source: string;
        target: string;
        label: string;
      }> = [];
      for (const e of snapshot.edges) {
        if (focus_set.has(e.source) && focus_set.has(e.target)) {
          edge_labels.push({
            source: e.source,
            target: e.target,
            label: "wiki",
          });
        }
      }
      renderer.show_edge_labels(edge_labels);
    } else {
      renderer.clear_edge_labels();
      renderer.set_filter(
        filter_override_ids ?? compute_filter_set(filter_query, snapshot),
      );
    }
  });

  $effect(() => {
    if (focus_node_path && container_el) {
      container_el.focus();
    }
  });

  function handle_keydown(event: KeyboardEvent) {
    if (event.key === "Escape" && focus_node_path && on_exit_focus) {
      on_exit_focus();
    }
  }

  function format_tooltip(info: EdgeHoverInfo): string {
    const parts = info.rules.map(
      (r) =>
        `${rule_chip_label(r.rule_id)} ${String(Math.round(r.raw_score * 100))}%`,
    );
    return `Score: ${String(Math.round(info.score * 100))}% — ${parts.join(", ")}`;
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
  class="VaultGraph"
  role="img"
  aria-label="Full vault graph"
  tabindex="-1"
  bind:this={container_el}
  oncontextmenu={(e) => e.preventDefault()}
  onclick={close_context_menu}
  onkeydown={handle_keydown}
>
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

  {#if context_menu}
    <div
      class="VaultGraph__context_menu"
      style="left:{String(context_menu.x)}px;top:{String(context_menu.y)}px;"
    >
      {#if on_dblclick_node}
        <button
          class="VaultGraph__context_menu_item"
          onclick={() => {
            if (context_menu) on_dblclick_node(context_menu.node_id);
            close_context_menu();
          }}
        >
          Focus node
        </button>
      {/if}
      {#if on_expand_node}
        <button
          class="VaultGraph__context_menu_item"
          onclick={() => {
            if (context_menu) on_expand_node(context_menu.node_id);
            close_context_menu();
          }}
        >
          Find similar notes
        </button>
      {/if}
      <button
        class="VaultGraph__context_menu_item"
        onclick={() => {
          if (context_menu) on_open_node(context_menu.node_id);
          close_context_menu();
        }}
      >
        Open note
      </button>
      {#if on_export_canvas}
        <button
          class="VaultGraph__context_menu_item"
          onclick={() => {
            on_export_canvas();
            close_context_menu();
          }}
        >
          Export as canvas
        </button>
      {/if}
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

  .VaultGraph__context_menu {
    position: absolute;
    z-index: 20;
    display: flex;
    flex-direction: column;
    min-width: 140px;
    border-radius: var(--radius);
    background: var(--popover);
    color: var(--popover-foreground);
    border: 1px solid var(--border);
    box-shadow: var(--shadow-sm, none);
    overflow: hidden;
  }

  .VaultGraph__context_menu_item {
    all: unset;
    display: block;
    padding: var(--space-2) var(--space-3);
    font-size: var(--text-xs);
    cursor: pointer;
    white-space: nowrap;
  }

  .VaultGraph__context_menu_item:hover {
    background: var(--accent);
    color: var(--accent-foreground);
  }
</style>
