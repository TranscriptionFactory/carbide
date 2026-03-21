<script lang="ts">
  import type { TagTreeNode } from "../types";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import { ACTION_IDS } from "$lib/app";
  import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
  import type { TagStore } from "../state/tag_store.svelte";
  import Self from "./tag_tree_node.svelte";

  type Props = {
    node: TagTreeNode;
    depth: number;
    tag_store: TagStore;
    action_registry: ActionRegistry;
  };

  let { node, depth, tag_store, action_registry }: Props = $props();

  let has_children = $derived(node.children.length > 0);
  let is_expanded = $derived(tag_store.is_expanded(node.full_tag));
  let total_count = $derived(node.own_count + node.descendant_count);
</script>

<div>
  <div
    class="flex items-center gap-0.5 group"
    style:padding-left="{depth * 12 + 8}px"
  >
    {#if has_children}
      <button
        type="button"
        class="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-muted"
        onclick={() =>
          void action_registry.execute(
            ACTION_IDS.tags_toggle_expanded,
            node.full_tag,
          )}
      >
        <ChevronRight
          size={12}
          class="transition-transform {is_expanded ? 'rotate-90' : ''}"
        />
      </button>
    {:else}
      <span class="shrink-0 w-4"></span>
    {/if}

    <button
      type="button"
      class="flex-1 min-w-0 text-left py-1 pr-2 rounded text-xs hover:bg-muted flex items-center justify-between gap-2"
      onclick={() => {
        if (has_children) {
          void action_registry.execute(
            ACTION_IDS.tags_select_prefix,
            node.full_tag,
          );
        } else {
          void action_registry.execute(ACTION_IDS.tags_select, node.full_tag);
        }
      }}
    >
      <span class="truncate">#{node.segment}</span>
      <span
        class="shrink-0 text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded-full"
      >
        {total_count}
      </span>
    </button>
  </div>

  {#if has_children && is_expanded}
    {#each node.children as child (child.full_tag)}
      <Self node={child} depth={depth + 1} {tag_store} {action_registry} />
    {/each}
  {/if}
</div>
