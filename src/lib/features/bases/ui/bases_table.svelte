<script lang="ts">
  import type { BaseNoteRow, BaseSort } from "../ports";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import ArrowDown from "@lucide/svelte/icons/arrow-down";

  let {
    rows,
    on_note_click,
    active_sort = null,
    on_sort_toggle,
  }: {
    rows: BaseNoteRow[];
    on_note_click: (path: string) => void;
    active_sort?: BaseSort | null;
    on_sort_toggle?: (property: string) => void;
  } = $props();

  const all_keys = $derived.by(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row.properties)) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort();
  });

  function sort_indicator(column: string) {
    if (active_sort?.property !== column) return null;
    return active_sort.descending ? "desc" : "asc";
  }
</script>

<div class="overflow-x-auto">
  <table class="w-full text-left text-xs border-collapse">
    <thead>
      <tr
        class="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
      >
        <th
          class="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 select-none"
          onclick={() => on_sort_toggle?.("title")}
        >
          <span class="inline-flex items-center gap-1">
            Note
            {#if sort_indicator("title") === "asc"}<ArrowUp
                size={10}
              />{:else if sort_indicator("title") === "desc"}<ArrowDown
                size={10}
              />{/if}
          </span>
        </th>
        {#each all_keys as key}
          <th
            class="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300 select-none"
            onclick={() => on_sort_toggle?.(key)}
          >
            <span class="inline-flex items-center gap-1">
              {key}
              {#if sort_indicator(key) === "asc"}<ArrowUp
                  size={10}
                />{:else if sort_indicator(key) === "desc"}<ArrowDown
                  size={10}
                />{/if}
            </span>
          </th>
        {/each}
        <th
          class="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider"
          >Tags</th
        >
      </tr>
    </thead>
    <tbody>
      {#each rows as row}
        <tr
          class="border-b border-zinc-100 dark:border-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-900/50 cursor-pointer"
          onclick={() => on_note_click(row.note.path)}
        >
          <td class="px-4 py-2 font-medium text-zinc-900 dark:text-zinc-100">
            {row.note.title || row.note.name}
          </td>
          {#each all_keys as key}
            <td class="px-4 py-2 text-zinc-600 dark:text-zinc-400">
              {row.properties[key]?.value ?? ""}
            </td>
          {/each}
          <td class="px-4 py-2">
            <div class="flex flex-wrap gap-1">
              {#each row.tags as tag}
                <span
                  class="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-[10px]"
                >
                  #{tag}
                </span>
              {/each}
            </div>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
