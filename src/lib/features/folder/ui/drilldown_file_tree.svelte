<script lang="ts">
  import type { NoteMeta } from "$lib/shared/types/note";
  import type { FileMeta } from "$lib/shared/types/filetree";
  import {
    list_folder,
    parent_path_of,
    type DrillDownEntry,
  } from "$lib/features/folder/domain/drilldown";
  import ArrowUp from "@lucide/svelte/icons/arrow-up";
  import Folder from "@lucide/svelte/icons/folder";
  import FileText from "@lucide/svelte/icons/file-text";
  import File from "@lucide/svelte/icons/file";
  import PeekTooltip from "./peek_tooltip.svelte";
  import {
    sanitize_note_color,
    sanitize_note_icon,
  } from "$lib/features/folder/domain/note_visuals";

  const PEEK_DELAY_MS = 500;

  let {
    notes,
    folder_paths,
    files,
    current_path,
    show_hidden_files,
    on_enter_folder,
    on_open_note,
    on_open_file,
  }: {
    notes: NoteMeta[];
    folder_paths: string[];
    files: FileMeta[];
    current_path: string;
    show_hidden_files: boolean;
    on_enter_folder: (path: string) => void;
    on_open_note: (path: string) => void;
    on_open_file: (path: string) => void;
  } = $props();

  const listing = $derived(
    list_folder(notes, folder_paths, files, current_path, show_hidden_files),
  );

  function go_up() {
    const parent = parent_path_of(current_path);
    if (parent !== null) on_enter_folder(parent);
  }

  function activate(entry: DrillDownEntry) {
    if (entry.is_folder) {
      on_enter_folder(entry.path);
    } else if (entry.note) {
      on_open_note(entry.path);
    } else {
      on_open_file(entry.path);
    }
  }

  const sorted_entries = $derived(
    [...listing.entries].sort((a, b) => {
      if (a.is_folder !== b.is_folder) return a.is_folder ? -1 : 1;
      return a.name.localeCompare(b.name);
    }),
  );

  let peek_note = $state<NoteMeta | null>(null);
  let peek_visible = $state(false);
  let peek_x = $state(0);
  let peek_y = $state(0);
  let peek_timer: ReturnType<typeof setTimeout> | undefined;

  function start_peek(entry: DrillDownEntry, e: MouseEvent) {
    if (!entry.note) return;
    clearTimeout(peek_timer);
    const target = entry.note;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    peek_timer = setTimeout(() => {
      peek_note = target;
      peek_x = rect.right + 8;
      peek_y = rect.top;
      peek_visible = true;
    }, PEEK_DELAY_MS);
  }

  function clear_peek() {
    clearTimeout(peek_timer);
    peek_visible = false;
    peek_note = null;
  }
</script>

<div class="h-full flex flex-col">
  {#if listing.parent_path !== null}
    <button
      type="button"
      class="flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 shrink-0"
      onclick={go_up}
    >
      <ArrowUp size={12} />
      <span class="truncate">.. ({current_path || "/"})</span>
    </button>
  {/if}

  <div class="flex-1 overflow-auto">
    {#if sorted_entries.length === 0}
      <p class="text-xs text-zinc-500 px-3 py-4 text-center">
        This folder is empty.
      </p>
    {:else}
      {#each sorted_entries as entry (entry.path)}
        {@const entry_color = entry.note
          ? sanitize_note_color(entry.note.color)
          : null}
        {@const entry_icon = entry.note
          ? sanitize_note_icon(entry.note.icon)
          : null}
        <button
          type="button"
          class="DrillRow w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
          style={entry_color ? `--note-color: ${entry_color};` : ""}
          ondblclick={() => activate(entry)}
          onclick={() => activate(entry)}
          onmouseenter={(e) => start_peek(entry, e)}
          onmouseleave={clear_peek}
        >
          {#if entry_color}
            <span class="DrillRow__color-stripe" aria-hidden="true"></span>
          {/if}
          {#if entry.is_folder}
            <Folder size={14} class="text-zinc-500 shrink-0" />
          {:else if entry.note}
            {#if entry_icon}
              <span class="DrillRow__icon-emoji" aria-hidden="true"
                >{entry_icon}</span
              >
            {:else}
              <FileText size={14} class="text-zinc-400 shrink-0" />
            {/if}
          {:else}
            <File size={14} class="text-zinc-400 shrink-0" />
          {/if}
          <span class="truncate">{entry.name}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>

<PeekTooltip note={peek_note} visible={peek_visible} x={peek_x} y={peek_y} />

<style>
  .DrillRow {
    position: relative;
  }
  .DrillRow__color-stripe {
    position: absolute;
    inset-block: 4px;
    inset-inline-start: 4px;
    width: 2px;
    border-radius: 1px;
    background: var(--note-color);
    pointer-events: none;
  }
  .DrillRow__icon-emoji {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    font-size: 13px;
    line-height: 1;
  }
</style>
