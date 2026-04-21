<script lang="ts">
  import type {
    SearchGraphNode,
    SearchGraphEdge,
    SearchGraphEdgeType,
  } from "$lib/features/graph/ports";
  import * as Select from "$lib/components/ui/select/index.js";
  import { Button } from "$lib/components/ui/button";

  type SortMode = "relevance" | "date_created" | "date_modified";

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
  let sort_mode = $state<SortMode>("relevance");
  let show_markdown = $state(true);
  let show_non_markdown = $state(true);
  let show_vault = $state(true);
  let show_linked = $state(true);

  function is_markdown(node: SearchGraphNode): boolean {
    return node.extension === "markdown" || node.extension == null;
  }

  const filtered_nodes = $derived(
    nodes.filter((n) => {
      if (n.kind === "neighbor") return true;
      const md = is_markdown(n);
      if (md && !show_markdown) return false;
      if (!md && !show_non_markdown) return false;
      if (n.source === "vault" && !show_vault) return false;
      if (n.source === "linked" && !show_linked) return false;
      return true;
    }),
  );

  const sorted_nodes = $derived(
    [...filtered_nodes].sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "hit" ? -1 : 1;
      if (sort_mode === "date_modified")
        return (b.date_modified_ms ?? 0) - (a.date_modified_ms ?? 0);
      if (sort_mode === "date_created")
        return (b.date_created_ms ?? 0) - (a.date_created_ms ?? 0);
      return (b.score ?? 0) - (a.score ?? 0);
    }),
  );

  const sort_options: { value: SortMode; label: string }[] = [
    { value: "relevance", label: "Relevance" },
    { value: "date_modified", label: "Modified" },
    { value: "date_created", label: "Created" },
  ];

  const has_non_markdown = $derived(
    nodes.some((n) => n.kind === "hit" && !is_markdown(n)),
  );
  const has_linked = $derived(
    nodes.some((n) => n.kind === "hit" && n.source === "linked"),
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

<div class="SearchGraphResultList">
  <div class="SearchGraphResultList__toolbar">
    <Select.Root
      type="single"
      value={sort_mode}
      onValueChange={(v: string | undefined) => {
        if (v) sort_mode = v as SortMode;
      }}
    >
      <Select.Trigger class="SearchGraphResultList__sort-trigger">
        <span data-slot="select-value">
          {sort_options.find((o) => o.value === sort_mode)?.label}
        </span>
      </Select.Trigger>
      <Select.Content>
        {#each sort_options as option (option.value)}
          <Select.Item value={option.value}>{option.label}</Select.Item>
        {/each}
      </Select.Content>
    </Select.Root>
    {#if has_non_markdown}
      <Button
        variant={show_markdown ? "default" : "outline"}
        size="sm"
        class="SearchGraphResultList__filter-btn"
        onclick={() => (show_markdown = !show_markdown)}
      >
        md
      </Button>
      <Button
        variant={show_non_markdown ? "default" : "outline"}
        size="sm"
        class="SearchGraphResultList__filter-btn"
        onclick={() => (show_non_markdown = !show_non_markdown)}
      >
        other
      </Button>
    {/if}
    {#if has_linked}
      <Button
        variant={show_vault ? "default" : "outline"}
        size="sm"
        class="SearchGraphResultList__filter-btn"
        onclick={() => (show_vault = !show_vault)}
      >
        vault
      </Button>
      <Button
        variant={show_linked ? "default" : "outline"}
        size="sm"
        class="SearchGraphResultList__filter-btn"
        onclick={() => (show_linked = !show_linked)}
      >
        linked
      </Button>
    {/if}
  </div>

  <div class="SearchGraphResultList__cards" role="list">
    {#each sorted_nodes as node (node.path)}
      {@const edge_types = edge_types_for_node(node.path)}
      <button
        use:register_card={node.path}
        class="SearchGraphResultList__card"
        class:SearchGraphResultList__card--selected={selected_node_id ===
          node.path}
        class:SearchGraphResultList__card--hovered={hovered_node_id ===
          node.path}
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
        <span class="SearchGraphResultList__path">{format_path(node.path)}</span
        >
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
</div>

<style>
  .SearchGraphResultList {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .SearchGraphResultList__toolbar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }

  :global(.SearchGraphResultList__sort-trigger) {
    height: 28px !important;
    font-size: var(--text-xs) !important;
    min-width: 100px;
    padding: 0 var(--space-2) !important;
  }

  :global(.SearchGraphResultList__filter-btn) {
    height: 24px !important;
    font-size: 10px !important;
    padding: 0 var(--space-2) !important;
    min-width: 0 !important;
  }

  .SearchGraphResultList__cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding: var(--space-2);
    overflow-y: auto;
    flex: 1;
    min-height: 0;
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
