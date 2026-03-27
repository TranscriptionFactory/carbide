<script lang="ts">
  import {
    ChevronRight,
    ChevronDown,
    FileText,
    FolderTree,
  } from "@lucide/svelte";
  import type { HierarchyTreeNode } from "$lib/features/graph";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";

  const { stores, action_registry } = use_app_context();

  const tree = $derived(stores.graph.hierarchy_tree);
  const status = $derived(stores.graph.status);
  const root_key = $derived(stores.graph.hierarchy_root_key);

  let collapsed = $state(new Set<string>());

  function toggle_collapse(key: string) {
    const next = new Set(collapsed);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsed = next;
  }

  function navigate_to_note(key: string) {
    void action_registry.execute(ACTION_IDS.note_open, key);
  }

  function focus_node(key: string) {
    void action_registry.execute(ACTION_IDS.graph_load_hierarchy, key);
  }
</script>

{#if status === "loading"}
  <div class="HierarchyTree__empty">Loading hierarchy...</div>
{:else if !tree || tree.length === 0}
  <div class="HierarchyTree__empty">
    <FolderTree class="HierarchyTree__empty-icon" />
    <span>No hierarchy data. Ensure documents have inclusion links.</span>
  </div>
{:else}
  {#if root_key}
    <button
      type="button"
      class="HierarchyTree__back"
      onclick={() =>
        void action_registry.execute(ACTION_IDS.graph_load_hierarchy)}
    >
      Show full tree
    </button>
  {/if}
  <div class="HierarchyTree__list">
    {#each tree as node (node.key)}
      {@render tree_node(node, 0)}
    {/each}
  </div>
{/if}

{#snippet tree_node(node: HierarchyTreeNode, depth: number)}
  <div class="HierarchyTree__node" style:padding-left="{depth * 16}px">
    {#if node.children.length > 0}
      <button
        type="button"
        class="HierarchyTree__toggle"
        onclick={() => toggle_collapse(node.key)}
        aria-label={collapsed.has(node.key) ? "Expand" : "Collapse"}
      >
        {#if collapsed.has(node.key)}
          <ChevronRight />
        {:else}
          <ChevronDown />
        {/if}
      </button>
    {:else}
      <span class="HierarchyTree__toggle-spacer"></span>
    {/if}
    <button
      type="button"
      class="HierarchyTree__label"
      onclick={() => navigate_to_note(node.key)}
      title={node.key}
    >
      <FileText class="HierarchyTree__icon" />
      <span class="HierarchyTree__name">{node.name || node.key}</span>
    </button>
  </div>
  {#if node.children.length > 0 && !collapsed.has(node.key)}
    {#each node.children as child (child.key)}
      {@render tree_node(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<style>
  .HierarchyTree__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-6);
    color: var(--muted-foreground);
    font-size: var(--text-sm);
    text-align: center;
  }

  :global(.HierarchyTree__empty-icon) {
    width: var(--size-icon-md);
    height: var(--size-icon-md);
    opacity: 0.5;
  }

  .HierarchyTree__back {
    display: block;
    width: 100%;
    padding: var(--space-1) var(--space-3);
    font-size: var(--text-xs);
    color: var(--primary);
    text-align: left;
    border-bottom: 1px solid var(--border);
  }

  .HierarchyTree__back:hover {
    background-color: var(--muted);
  }

  .HierarchyTree__list {
    overflow-y: auto;
    flex: 1;
  }

  .HierarchyTree__node {
    display: flex;
    align-items: center;
    min-height: 28px;
  }

  .HierarchyTree__toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    flex-shrink: 0;
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
  }

  .HierarchyTree__toggle:hover {
    color: var(--foreground);
    background-color: var(--muted);
  }

  :global(.HierarchyTree__toggle svg) {
    width: 14px;
    height: 14px;
  }

  .HierarchyTree__toggle-spacer {
    width: 20px;
    flex-shrink: 0;
  }

  .HierarchyTree__label {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
    padding: var(--space-0-5) var(--space-1);
    font-size: var(--text-xs);
    color: var(--foreground);
    border-radius: var(--radius-sm);
    text-align: left;
  }

  .HierarchyTree__label:hover {
    background-color: var(--muted);
  }

  :global(.HierarchyTree__icon) {
    width: var(--size-icon-xs);
    height: var(--size-icon-xs);
    flex-shrink: 0;
    color: var(--muted-foreground);
  }

  .HierarchyTree__name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
