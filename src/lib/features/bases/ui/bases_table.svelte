<script lang="ts">
  import type { BaseNoteRow } from "../ports";

  let {
    rows,
    on_note_click,
  }: {
    rows: BaseNoteRow[];
    on_note_click: (path: string) => void;
  } = $props();

  // Extract all unique property keys from the results
  const all_keys = $derived.by(() => {
    const keys = new Set<string>();
    for (const row of rows) {
      for (const key of Object.keys(row.properties)) {
        keys.add(key);
      }
    }
    return Array.from(keys).sort();
  });
</script>

<div class="overflow-x-auto">
  <table class="w-full text-left text-xs border-collapse">
    <thead>
      <tr
        class="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900"
      >
        <th
          class="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider"
          >Note</th
        >
        {#each all_keys as key}
          <th
            class="px-4 py-2 font-semibold text-zinc-500 uppercase tracking-wider"
            >{key}</th
          >
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
