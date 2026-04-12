<script lang="ts">
  import type {
    SearchGraphNode,
    SearchGraphEdge,
    SearchGraphEdgeType,
  } from "$lib/features/graph/ports";

  type Props = {
    nodes: SearchGraphNode[];
    edges: SearchGraphEdge[];
    selected_node_id: string | null;
    hovered_node_id: string | null;
    scroll_to_path: string | null;
    on_select: (path: string) => void;
    on_hover: (path: string | null) => void;
    on_open: (path: string) => void;
    on_scroll_done: () => void;
  };

  let {
    nodes,
    edges,
    selected_node_id,
    hovered_node_id,
    scroll_to_path,
    on_select,
    on_hover,
    on_open,
    on_scroll_done,
  }: Props = $props();

  let card_elements = $state<Map<string, HTMLElement>>(new Map());

  const sorted_nodes = $derived(
    [...nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "hit" ? -1 : 1;
      return (b.score ?? 0) - (a.score ?? 0);
    }),
  );

  function edge_types_for_node(path: string): Set<SearchGraphEdgeType> {
    const types = new Set<SearchGraphEdgeType>();
    for (const e of edges) {
      if (e.source === path || e.target === path) {
        types.add(e.edge_type);
      }
    }
    return types;
  }

  function register_card(node: HTMLElement, path: string) {
    card_elements.set(path, node);
    return {
      destroy() {
        card_elements.delete(path);
      },
    };
  }

  $effect(() => {
    if (!scroll_to_path) return;
    const el = card_elements.get(scroll_to_path);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      on_scroll_done();
    }
  });

  function format_path(path: string): string {
    const parts = path.split("/");
    return parts.length > 2 ? `.../${parts.slice(-2).join("/")}` : path;
  }
</script>

<div class="SearchGraphResultList" role="list">
  {#each sorted_nodes as node (node.path)}
    {@const edge_types = edge_types_for_node(node.path)}
    <button
      use:register_card={node.path}
      class="SearchGraphResultList__card"
      class:SearchGraphResultList__card--selected={selected_node_id ===
        node.path}
      class:SearchGraphResultList__card--hovered={hovered_node_id === node.path}
      class:SearchGraphResultList__card--hit={node.kind === "hit"}
      class:SearchGraphResultList__card--neighbor={node.kind === "neighbor"}
      onclick={() => on_select(node.path)}
      ondblclick={() => on_open(node.path)}
      onpointerenter={() => on_hover(node.path)}
      onpointerleave={() => on_hover(null)}
    >
      <div class="SearchGraphResultList__header">
        <span class="SearchGraphResultList__title">{node.title}</span>
        <span
          class="SearchGraphResultList__badge"
          class:SearchGraphResultList__badge--hit={node.kind === "hit"}
          class:SearchGraphResultList__badge--neighbor={node.kind ===
            "neighbor"}
        >
          {node.kind}
        </span>
      </div>
      <span class="SearchGraphResultList__path">{format_path(node.path)}</span>
      {#if node.snippet}
        <p class="SearchGraphResultList__snippet">{node.snippet}</p>
      {/if}
      {#if edge_types.size > 0}
        <div class="SearchGraphResultList__edges">
          {#if edge_types.has("wiki")}
            <span
              class="SearchGraphResultList__edge-indicator SearchGraphResultList__edge-indicator--wiki"
              title="Wiki link"
            >
              <span
                class="SearchGraphResultList__edge-line SearchGraphResultList__edge-line--wiki"
              ></span>
              wiki
            </span>
          {/if}
          {#if edge_types.has("semantic")}
            <span
              class="SearchGraphResultList__edge-indicator SearchGraphResultList__edge-indicator--semantic"
              title="Semantic"
            >
              <span
                class="SearchGraphResultList__edge-line SearchGraphResultList__edge-line--semantic"
              ></span>
              semantic
            </span>
          {/if}
          {#if edge_types.has("smart_link")}
            <span
              class="SearchGraphResultList__edge-indicator SearchGraphResultList__edge-indicator--smart"
              title="Smart link"
            >
              <span
                class="SearchGraphResultList__edge-line SearchGraphResultList__edge-line--smart"
              ></span>
              smart
            </span>
          {/if}
        </div>
      {/if}
    </button>
  {/each}
  {#if sorted_nodes.length === 0}
    <p class="SearchGraphResultList__empty">No results</p>
  {/if}
</div>

<style>
  .SearchGraphResultList {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    overflow-y: auto;
    height: 100%;
  }

  .SearchGraphResultList__card {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--card);
    cursor: pointer;
    text-align: start;
    transition:
      background-color 150ms,
      border-color 150ms;
  }

  .SearchGraphResultList__card:hover,
  .SearchGraphResultList__card--hovered {
    background: var(--accent);
  }

  .SearchGraphResultList__card--selected {
    border-color: var(--primary);
    background: var(--accent);
  }

  .SearchGraphResultList__card--neighbor {
    opacity: 0.75;
  }

  .SearchGraphResultList__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .SearchGraphResultList__title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .SearchGraphResultList__path {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .SearchGraphResultList__snippet {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    line-height: 1.4;
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .SearchGraphResultList__edges {
    display: flex;
    gap: var(--space-2);
    margin-top: var(--space-1);
  }

  .SearchGraphResultList__edge-indicator {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 10px;
    color: var(--muted-foreground);
  }

  .SearchGraphResultList__edge-line {
    display: inline-block;
    width: 12px;
    height: 2px;
  }

  .SearchGraphResultList__edge-line--wiki {
    background: var(--muted-foreground);
  }

  .SearchGraphResultList__edge-line--semantic {
    background: repeating-linear-gradient(
      to right,
      var(--muted-foreground) 0 3px,
      transparent 3px 5px
    );
  }

  .SearchGraphResultList__edge-line--smart {
    background: repeating-linear-gradient(
      to right,
      var(--muted-foreground) 0 1px,
      transparent 1px 3px
    );
  }

  .SearchGraphResultList__badge {
    flex-shrink: 0;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .SearchGraphResultList__badge--hit {
    background: var(--primary);
    color: var(--primary-foreground);
  }

  .SearchGraphResultList__badge--neighbor {
    border: 1px solid var(--border);
    color: var(--muted-foreground);
  }

  .SearchGraphResultList__empty {
    padding: var(--space-6);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    text-align: center;
  }
</style>
