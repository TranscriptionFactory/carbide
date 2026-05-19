<script lang="ts">
  import type { BaseNoteRow } from "../ports";

  let {
    rows,
    on_note_click,
  }: {
    rows: BaseNoteRow[];
    on_note_click: (path: string) => void;
  } = $props();
</script>

<div class="p-4">
  <div
    class="grid gap-4"
    style="grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));"
  >
    {#each rows as row}
      <button
        type="button"
        class="text-left bg-white dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors cursor-pointer overflow-hidden shadow-sm"
        onclick={() => on_note_click(row.note.path)}
      >
        {#if row.first_image_path}
          <div class="h-24 bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
            <img
              src="asset://localhost/{row.first_image_path}"
              alt=""
              class="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
        {:else}
          <div
            class="h-24 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center"
          >
            <span class="text-3xl opacity-30">📄</span>
          </div>
        {/if}

        <div class="p-3 space-y-2">
          <h3 class="text-sm font-medium truncate">
            {row.note.title || row.note.name}
          </h3>

          {#if row.content_snippet || row.note.blurb}
            <p class="text-[11px] text-zinc-500 line-clamp-2">
              {row.content_snippet || row.note.blurb}
            </p>
          {/if}

          {#if row.tags.length > 0}
            <div class="flex flex-wrap gap-1">
              {#each row.tags.slice(0, 4) as tag}
                <span
                  class="px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[9px] text-zinc-500"
                >
                  #{tag}
                </span>
              {/each}
              {#if row.tags.length > 4}
                <span class="text-[9px] text-zinc-400"
                  >+{row.tags.length - 4}</span
                >
              {/if}
            </div>
          {/if}

          {#if Object.keys(row.properties).length > 0}
            <div class="space-y-0.5">
              {#each Object.entries(row.properties).slice(0, 3) as [key, prop]}
                <div class="flex items-center gap-1 text-[10px]">
                  <span class="text-zinc-400 truncate">{key}:</span>
                  <span class="text-zinc-600 dark:text-zinc-300 truncate"
                    >{prop.value}</span
                  >
                </div>
              {/each}
            </div>
          {/if}

          {#if row.stats.task_count > 0}
            <div class="flex items-center gap-2">
              <div
                class="flex-1 h-1 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden"
              >
                <div
                  class="h-full bg-emerald-500 rounded-full"
                  style="width: {(row.stats.tasks_done / row.stats.task_count) *
                    100}%"
                ></div>
              </div>
              <span class="text-[10px] text-zinc-400 tabular-nums shrink-0">
                {row.stats.tasks_done}/{row.stats.task_count}
              </span>
            </div>
          {/if}
        </div>
      </button>
    {/each}
  </div>
</div>
