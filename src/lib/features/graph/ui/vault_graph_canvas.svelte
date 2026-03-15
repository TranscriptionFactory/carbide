<script lang="ts">
  import type {
    SemanticEdge,
    VaultGraphSnapshot,
  } from "$lib/features/graph/ports";
  import { VaultGraphRenderer } from "$lib/features/graph/domain/vault_graph_renderer";
  import { onDestroy } from "svelte";

  type Props = {
    snapshot: VaultGraphSnapshot;
    filter_query: string;
    selected_node_ids: string[];
    hovered_node_id: string | null;
    semantic_edges: SemanticEdge[];
    show_semantic_edges: boolean;
    on_select_node: (node_id: string) => void;
    on_hover_node: (node_id: string | null) => void;
    on_open_node: (path: string) => void;
  };

  let {
    snapshot,
    filter_query,
    selected_node_ids,
    hovered_node_id,
    semantic_edges,
    show_semantic_edges,
    on_select_node,
    on_hover_node,
    on_open_node,
  }: Props = $props();

  let container_el = $state<HTMLElement | null>(null);
  let renderer: VaultGraphRenderer | null = null;
  let worker: Worker | null = null;
  let current_snapshot_ref: VaultGraphSnapshot | null = null;

  function matches_filter(query: string, label: string, id: string): boolean {
    if (!query) return true;
    const lower = query.toLocaleLowerCase();
    return (
      label.toLocaleLowerCase().includes(lower) ||
      id.toLocaleLowerCase().includes(lower)
    );
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

  function create_worker(): Worker {
    return new Worker(
      new URL(
        "$lib/features/graph/domain/vault_graph_worker.ts",
        import.meta.url,
      ),
      { type: "module" },
    );
  }

  function handle_worker_message(
    event: MessageEvent,
    r: VaultGraphRenderer,
  ): void {
    const msg = event.data;
    if (msg.type === "positions") {
      const ids: string[] = msg.ids;
      const buffer: Float64Array = msg.buffer;
      const positions = new Map<string, { x: number; y: number }>();
      for (let i = 0; i < ids.length; i++) {
        positions.set(ids[i]!, {
          x: buffer[i * 2]!,
          y: buffer[i * 2 + 1]!,
        });
      }
      r.update_positions(positions);
    }
  }

  async function setup(el: HTMLElement, snap: VaultGraphSnapshot) {
    cleanup();

    const r = new VaultGraphRenderer();
    renderer = r;

    r.on_node_click = on_select_node;
    r.on_node_hover = on_hover_node;
    r.on_node_dblclick = on_open_node;

    await r.initialize(el);

    r.set_graph(
      snap.nodes.map((n) => ({ id: n.path, label: n.title })),
      snap.edges,
    );

    const w = create_worker();
    worker = w;
    w.onmessage = (event) => handle_worker_message(event, r);
    w.postMessage({
      type: "init",
      nodes: snap.nodes.map((n) => ({ id: n.path })),
      edges: snap.edges,
    });
  }

  function cleanup() {
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

  $effect(() => {
    if (!container_el) return;
    if (snapshot === current_snapshot_ref) return;
    current_snapshot_ref = snapshot;
    void setup(container_el, snapshot);
  });

  $effect(() => {
    renderer?.set_filter(compute_filter_set(filter_query, snapshot));
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
    renderer?.set_semantic_edges(semantic_edges, show_semantic_edges);
  });

  onDestroy(cleanup);
</script>

<div
  class="VaultGraph"
  bind:this={container_el}
  role="img"
  aria-label="Full vault graph"
>
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
</style>
