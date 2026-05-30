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
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-zinc-100 dark:hover:bg-zinc-900"
          ondblclick={() => activate(entry)}
          onclick={() => activate(entry)}
        >
          {#if entry.is_folder}
            <Folder size={14} class="text-zinc-500 shrink-0" />
          {:else if entry.note}
            <FileText size={14} class="text-zinc-400 shrink-0" />
          {:else}
            <File size={14} class="text-zinc-400 shrink-0" />
          {/if}
          <span class="truncate">{entry.name}</span>
        </button>
      {/each}
    {/if}
  </div>
</div>
