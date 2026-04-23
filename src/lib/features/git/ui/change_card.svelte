<script lang="ts">
  import type { GitFileStatus } from "$lib/features/git/types/git";
  import { Plus, Minus } from "@lucide/svelte";
  import {
    note_name_from_path,
    parent_folder_path,
  } from "$lib/shared/utils/path";

  type Props = {
    file: GitFileStatus;
    is_staged: boolean;
    on_toggle_stage: (path: string) => void;
  };

  let { file, is_staged, on_toggle_stage }: Props = $props();

  const filename = $derived(note_name_from_path(file.path));
  const folder = $derived(parent_folder_path(file.path));

  const status_label = $derived(
    file.status === "modified"
      ? "M"
      : file.status === "added" || file.status === "untracked"
        ? "A"
        : file.status === "deleted"
          ? "D"
          : file.status === "conflicted"
            ? "C"
            : "?",
  );
</script>

<button
  type="button"
  class="ChangeCard"
  class:ChangeCard--modified={file.status === "modified"}
  class:ChangeCard--added={file.status === "added" ||
    file.status === "untracked"}
  class:ChangeCard--deleted={file.status === "deleted"}
  class:ChangeCard--conflicted={file.status === "conflicted"}
  onclick={() => on_toggle_stage(file.path)}
  aria-label="{is_staged ? 'Unstage' : 'Stage'} {file.path}"
>
  <span class="ChangeCard__status">{status_label}</span>
  <span class="ChangeCard__name">{filename}</span>
  {#if folder}
    <span class="ChangeCard__folder">{folder}</span>
  {/if}
  <span class="ChangeCard__toggle">
    {#if is_staged}
      <Minus class="ChangeCard__icon" />
    {:else}
      <Plus class="ChangeCard__icon" />
    {/if}
  </span>
</button>

<style>
  .ChangeCard {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    border-inline-start: 2px solid transparent;
    font-size: var(--text-xs);
    color: var(--foreground);
    text-align: start;
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .ChangeCard:hover {
    background-color: var(--accent);
  }

  .ChangeCard--modified {
    border-inline-start-color: var(--warning);
  }

  .ChangeCard--added {
    border-inline-start-color: var(--indicator-clean);
  }

  .ChangeCard--deleted {
    border-inline-start-color: var(--destructive);
  }

  .ChangeCard--conflicted {
    border-inline-start-color: var(--destructive);
  }

  .ChangeCard__status {
    flex-shrink: 0;
    width: 1rem;
    text-align: center;
    font-weight: 600;
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    opacity: 0.7;
  }

  .ChangeCard__name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ChangeCard__folder {
    flex-shrink: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.5;
    font-size: var(--text-2xs);
  }

  .ChangeCard__toggle {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    opacity: 0.5;
  }

  .ChangeCard:hover .ChangeCard__toggle {
    opacity: 1;
  }

  :global(.ChangeCard__icon) {
    width: 14px;
    height: 14px;
  }
</style>
