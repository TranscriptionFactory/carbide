<script lang="ts">
  import type { BaseNoteRow, PropertyInfo, TreeConfig } from "../ports";
  import { group_rows_by_tree, type TreeNode } from "../domain/tree_grouping";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import FileText from "@lucide/svelte/icons/file-text";
  import Folder from "@lucide/svelte/icons/folder";
  import X from "@lucide/svelte/icons/x";

  let {
    rows,
    config,
    available_properties,
    on_note_click,
    on_config_change,
  }: {
    rows: BaseNoteRow[];
    config: TreeConfig | null;
    available_properties: PropertyInfo[];
    on_note_click: (path: string) => void;
    on_config_change: (config: TreeConfig | null) => void;
  } = $props();

  const groupable_properties = $derived(
    available_properties.filter(
      (p) => p.unique_values !== null || p.property_type === "date",
    ),
  );

  const group_by = $derived(config?.group_by ?? []);

  const tree: TreeNode[] = $derived.by(() => {
    if (group_by.length === 0) return [];
    return group_rows_by_tree(rows, group_by, config?.date_format);
  });

  let expanded = $state(new Set<string>());

  function toggle(path: string) {
    if (expanded.has(path)) {
      expanded.delete(path);
    } else {
      expanded.add(path);
    }
    expanded = new Set(expanded);
  }

  function add_grouping(property: string) {
    const existing = config?.group_by ?? [];
    if (existing.includes(property)) return;
    const next: TreeConfig = { group_by: [...existing, property] };
    if (config?.date_format) next.date_format = config.date_format;
    on_config_change(next);
  }

  function remove_grouping(index: number) {
    const next_groups = (config?.group_by ?? []).filter((_, i) => i !== index);
    if (next_groups.length === 0) {
      on_config_change(null);
      return;
    }
    const next: TreeConfig = { group_by: next_groups };
    if (config?.date_format) next.date_format = config.date_format;
    on_config_change(next);
  }

  function count_descendant_rows(node: TreeNode): number {
    let total = 0;
    for (const child of node.children) {
      total += child.rows.length + count_descendant_rows(child);
    }
    return total;
  }
</script>

{#snippet render_node(node: TreeNode, depth: number)}
  {@const is_expanded = expanded.has(node.path)}
  <div>
    <button
      type="button"
      class="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent text-left"
      style="padding-left: {depth * 14 + 8}px"
      onclick={() => toggle(node.path)}
    >
      {#if is_expanded}
        <ChevronDown size={12} class="text-muted-foreground shrink-0" />
      {:else}
        <ChevronRight size={12} class="text-muted-foreground shrink-0" />
      {/if}
      <Folder size={12} class="text-muted-foreground shrink-0" />
      <span class="truncate font-medium">{node.label}</span>
      <span class="text-[10px] text-muted-foreground tabular-nums ml-auto shrink-0">
        {node.rows.length + count_descendant_rows(node)}
      </span>
    </button>
    {#if is_expanded}
      {#each node.children as child}
        {@render render_node(child, depth + 1)}
      {/each}
      {#each node.rows as row}
        <button
          type="button"
          class="w-full flex items-center gap-1.5 px-2 py-1 text-xs hover:bg-accent text-left"
          style="padding-left: {(depth + 1) * 14 + 8}px"
          onclick={() => on_note_click(row.note.path)}
        >
          <FileText size={12} class="text-muted-foreground shrink-0" />
          <span class="truncate">{row.note.title || row.note.name}</span>
        </button>
      {/each}
    {/if}
  </div>
{/snippet}

<div class="h-full flex flex-col">
  <div
    class="px-3 py-2 border-b border-border flex items-center gap-2 flex-wrap"
  >
    <span class="text-[10px] text-muted-foreground shrink-0">Group by:</span>
    {#each group_by as prop, i}
      <span
        class="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-muted rounded"
      >
        {prop}
        <button
          type="button"
          class="hover:text-red-500"
          onclick={() => remove_grouping(i)}
          aria-label="Remove grouping"
        >
          <X size={10} />
        </button>
      </span>
    {/each}
    <select
      class="text-xs px-1 py-0.5 bg-card border border-border rounded"
      value=""
      onchange={(e) => {
        const value = (e.target as HTMLSelectElement).value;
        if (value) {
          add_grouping(value);
          (e.target as HTMLSelectElement).value = "";
        }
      }}
    >
      <option value="">+ Add</option>
      <option value="tags">tags</option>
      {#each groupable_properties as prop}
        {#if !group_by.includes(prop.name)}
          <option value={prop.name}>{prop.name}</option>
        {/if}
      {/each}
    </select>
  </div>

  <div class="flex-1 overflow-auto">
    {#if group_by.length === 0}
      {#each rows as row}
        <button
          type="button"
          class="w-full flex items-center gap-1.5 px-3 py-1 text-xs hover:bg-accent text-left"
          onclick={() => on_note_click(row.note.path)}
        >
          <FileText size={12} class="text-muted-foreground shrink-0" />
          <span class="truncate">{row.note.title || row.note.name}</span>
        </button>
      {/each}
    {:else}
      {#each tree as node}
        {@render render_node(node, 0)}
      {/each}
    {/if}
  </div>
</div>
