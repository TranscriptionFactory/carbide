<script lang="ts">
  import type {
    SearchGraphNode,
    SearchGraphEdge,
    SearchGraphEdgeType,
  } from "$lib/features/graph/ports";
  import {
    sort_search_graph_nodes,
    type SearchGraphSortMode,
  } from "$lib/features/graph/domain/sort_search_graph_nodes";
  import { build_search_graph_result_menu } from "$lib/features/graph/domain/search_graph_result_menu";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import { Button } from "$lib/components/ui/button";
  import { Input } from "$lib/components/ui/input";
  import { Users, X, ArrowDownAZ, ArrowUpAZ } from "@lucide/svelte";

  type Props = {
    nodes: SearchGraphNode[];
    edges: SearchGraphEdge[];
    selected_node_id: string | null;
    selected_node_ids: Set<string>;
    hovered_node_id: string | null;
    scroll_to_path: string | null;
    show_neighbors: boolean;
    min_score: number;
    sort_mode: SearchGraphSortMode;
    sort_ascending: boolean;
    on_select: (path: string) => void;
    on_hover: (path: string | null) => void;
    on_open: (path: string) => void;
    on_scroll_done: () => void;
    on_toggle_select: (
      path: string,
      shift_key: boolean,
      ordered_paths: string[],
    ) => void;
    on_set_min_score: (score: number) => void;
    on_toggle_neighbors: () => void;
    on_set_sort_mode: (mode: SearchGraphSortMode) => void;
    on_toggle_sort_order: () => void;
    on_open_to_side: (path: string) => void;
    on_copy_path: (path: string) => void;
    on_reveal_in_file_manager: (path: string) => void;
    on_open_in_default_app: (path: string) => void;
    on_find_similar: (path: string) => void;
  };

  let {
    nodes,
    edges,
    selected_node_id,
    selected_node_ids,
    hovered_node_id,
    scroll_to_path,
    show_neighbors,
    min_score,
    sort_mode,
    sort_ascending,
    on_select,
    on_hover,
    on_open,
    on_scroll_done,
    on_toggle_select,
    on_set_min_score,
    on_toggle_neighbors,
    on_set_sort_mode,
    on_toggle_sort_order,
    on_open_to_side,
    on_copy_path,
    on_reveal_in_file_manager,
    on_open_in_default_app,
    on_find_similar,
  }: Props = $props();

  let card_elements = $state<Map<string, HTMLElement>>(new Map());
  let show_markdown = $state(true);
  let show_non_markdown = $state(true);
  let show_vault = $state(true);
  let show_linked = $state(true);
  let score_input = $state("");

  function is_markdown(node: SearchGraphNode): boolean {
    return node.extension === "markdown" || node.extension == null;
  }

  const filtered_nodes = $derived(
    nodes.filter((n) => {
      if (n.kind === "neighbor") return show_neighbors;
      const md = is_markdown(n);
      if (md && !show_markdown) return false;
      if (!md && !show_non_markdown) return false;
      if (n.source === "vault" && !show_vault) return false;
      if (n.source === "linked" && !show_linked) return false;
      if (min_score > 0 && (n.score ?? 0) < min_score) return false;
      return true;
    }),
  );

  const sorted_nodes = $derived(
    sort_search_graph_nodes(filtered_nodes, sort_mode, sort_ascending),
  );

  const ordered_paths = $derived(sorted_nodes.map((n) => n.path));

  const sort_options: { value: SearchGraphSortMode; label: string }[] = [
    { value: "relevance", label: "Relevance" },
    { value: "date_modified", label: "Modified" },
    { value: "date_created", label: "Created" },
    { value: "name", label: "Name" },
  ];

  const has_non_markdown = $derived(
    nodes.some((n) => n.kind === "hit" && !is_markdown(n)),
  );
  const has_linked = $derived(
    nodes.some((n) => n.kind === "hit" && n.source === "linked"),
  );
  const has_neighbors = $derived(nodes.some((n) => n.kind === "neighbor"));

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

  function handle_card_click(event: MouseEvent, path: string) {
    if (event.metaKey || event.ctrlKey || event.shiftKey) {
      on_toggle_select(path, event.shiftKey, ordered_paths);
    } else {
      on_select(path);
    }
  }

  function handle_score_input(value: string) {
    score_input = value;
    const parsed = parseFloat(value);
    on_set_min_score(Number.isNaN(parsed) ? 0 : parsed);
  }
</script>

<div class="SearchGraphResultList">
  <div class="SearchGraphResultList__toolbar">
    <Select.Root
      type="single"
      value={sort_mode}
      onValueChange={(v: string | undefined) => {
        if (v) on_set_sort_mode(v as SearchGraphSortMode);
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
    <Button
      variant="outline"
      size="sm"
      class="SearchGraphResultList__filter-btn"
      title={sort_ascending ? "Sort ascending" : "Sort descending"}
      aria-pressed={sort_ascending}
      onclick={on_toggle_sort_order}
    >
      {#if sort_ascending}
        <ArrowUpAZ size={12} />
      {:else}
        <ArrowDownAZ size={12} />
      {/if}
    </Button>
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
    {#if has_neighbors}
      <Button
        variant={show_neighbors ? "default" : "outline"}
        size="sm"
        class="SearchGraphResultList__filter-btn"
        title={show_neighbors ? "Hide neighbors" : "Show neighbors"}
        onclick={on_toggle_neighbors}
      >
        <Users size={10} />
      </Button>
    {/if}
    <Input
      value={score_input}
      placeholder="min"
      class="SearchGraphResultList__score-input"
      oninput={(event) => handle_score_input(event.currentTarget.value)}
    />
    {#if selected_node_ids.size > 0}
      <Button
        variant="ghost"
        size="sm"
        class="SearchGraphResultList__filter-btn"
        title="Clear selection"
        onclick={() => on_toggle_select("", false, [])}
      >
        <X size={10} />
        {selected_node_ids.size}
      </Button>
    {/if}
  </div>

  <div class="SearchGraphResultList__cards" role="list">
    {#each sorted_nodes as node (node.path)}
      {@const edge_types = edge_types_for_node(node.path)}
      {@const is_multi_selected = selected_node_ids.has(node.path)}
      {@const menu_items = build_search_graph_result_menu(node.path, {
        on_open,
        on_open_to_side,
        on_copy_path,
        on_reveal_in_file_manager,
        on_open_in_default_app,
        on_find_similar,
        on_focus_node: on_select,
      })}
      <ContextMenu.Root>
        <ContextMenu.Trigger class="w-full">
          <button
            use:register_card={node.path}
            class="SearchGraphResultList__card"
            class:SearchGraphResultList__card--selected={selected_node_id ===
              node.path}
            class:SearchGraphResultList__card--multi-selected={is_multi_selected}
            class:SearchGraphResultList__card--hovered={hovered_node_id ===
              node.path}
            class:SearchGraphResultList__card--hit={node.kind === "hit"}
            class:SearchGraphResultList__card--neighbor={node.kind ===
              "neighbor"}
            onclick={(e) => handle_card_click(e, node.path)}
            ondblclick={() => on_open(node.path)}
            onpointerenter={() => on_hover(node.path)}
            onpointerleave={() => on_hover(null)}
          >
            <div class="SearchGraphResultList__header">
              <span class="SearchGraphResultList__title">{node.title}</span>
              <div class="SearchGraphResultList__header-right">
                {#if node.kind === "hit" && node.score != null}
                  <span class="SearchGraphResultList__score"
                    >{node.score.toFixed(2)}</span
                  >
                {/if}
                <span
                  class="SearchGraphResultList__badge"
                  class:SearchGraphResultList__badge--hit={node.kind === "hit"}
                  class:SearchGraphResultList__badge--neighbor={node.kind ===
                    "neighbor"}
                >
                  {node.kind}
                </span>
              </div>
            </div>
            <span class="SearchGraphResultList__path"
              >{format_path(node.path)}</span
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
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content>
            {#each menu_items as item (item.id)}
              {#if item.separator_before}
                <ContextMenu.Separator />
              {/if}
              <ContextMenu.Item onSelect={item.select}>
                <span>{item.label}</span>
              </ContextMenu.Item>
            {/each}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
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
    flex-wrap: wrap;
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

  :global(.SearchGraphResultList__score-input) {
    height: 24px !important;
    font-size: 10px !important;
    width: 48px !important;
    min-width: 0 !important;
    padding: 0 var(--space-1) !important;
    text-align: center;
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

  .SearchGraphResultList__card--multi-selected {
    border-inline-start: 3px solid var(--primary);
    background: color-mix(in srgb, var(--primary) 8%, var(--card));
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

  .SearchGraphResultList__header-right {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex-shrink: 0;
  }

  .SearchGraphResultList__score {
    font-size: 10px;
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
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
