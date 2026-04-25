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
    on_view_diff: (path: string) => void;
  };

  let { file, is_staged, on_toggle_stage, on_view_diff }: Props = $props();

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

<div class="ChangeCard" role="group">
  <button
    type="button"
    class="ChangeCard__main"
    onclick={() => on_view_diff(file.path)}
    aria-label="View diff for {file.path}"
  >
    <span class="ChangeCard__status">{status_label}</span>
    <span class="ChangeCard__name">{filename}</span>
    {#if folder}
      <span class="ChangeCard__folder">{folder}</span>
    {/if}
  </button>
  <button
    type="button"
    class="ChangeCard__toggle"
    onclick={() => on_toggle_stage(file.path)}
    aria-label="{is_staged ? 'Unstage' : 'Stage'} {file.path}"
  >
    {#if is_staged}
      <Minus class="ChangeCard__icon" />
    {:else}
      <Plus class="ChangeCard__icon" />
    {/if}
  </button>
</div>

<style>
  .ChangeCard {
    display: flex;
    align-items: center;
    width: 100%;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--foreground);
    transition: background-color var(--duration-fast) var(--ease-default);
  }

  .ChangeCard:hover {
    background-color: var(--accent);
  }

  .ChangeCard__main {
    display: flex;
    align-items: center;
    gap: var(--space-1-5);
    flex: 1;
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    text-align: start;
    color: inherit;
    font-size: inherit;
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
    padding: var(--space-1) var(--space-2);
    opacity: 0.5;
    color: inherit;
  }

  .ChangeCard:hover .ChangeCard__toggle {
    opacity: 1;
  }

  :global(.ChangeCard__icon) {
    width: 14px;
    height: 14px;
  }
</style>
