<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { FileDiff } from "@lucide/svelte";
  import GitDiffView from "$lib/features/git/ui/git_diff_view.svelte";
  import type { GitDiff } from "$lib/features/git/types/git";
  import {
    note_name_from_path,
    parent_folder_path,
  } from "$lib/shared/utils/path";

  interface Props {
    open: boolean;
    file_path: string | null;
    is_staged: boolean;
    is_loading: boolean;
    diff: GitDiff | null;
    on_close: () => void;
    on_toggle_stage: (path: string) => void;
  }

  let {
    open,
    file_path,
    is_staged,
    is_loading,
    diff,
    on_close,
    on_toggle_stage,
  }: Props = $props();

  const filename = $derived(file_path ? note_name_from_path(file_path) : "");
  const folder = $derived(file_path ? parent_folder_path(file_path) : "");
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value) on_close();
  }}
>
  <Dialog.Content class="DiffViewer__dialog">
    <Dialog.Header>
      <Dialog.Title class="DiffViewer__title">
        <FileDiff class="DiffViewer__title-icon" />
        {filename}
      </Dialog.Title>
      {#if folder}
        <Dialog.Description class="DiffViewer__description">
          {folder}
        </Dialog.Description>
      {/if}
    </Dialog.Header>

    <div class="DiffViewer__body">
      {#if is_loading}
        <div class="DiffViewer__loading">Loading diff...</div>
      {:else if diff}
        <div class="DiffViewer__stats">
          <span class="DiffViewer__stat DiffViewer__stat--add">
            +{diff.additions}
          </span>
          <span class="DiffViewer__stat DiffViewer__stat--del">
            -{diff.deletions}
          </span>
        </div>
        <div class="DiffViewer__content">
          <GitDiffView {diff} />
        </div>
      {:else}
        <div class="DiffViewer__empty">No changes to display</div>
      {/if}
    </div>

    <Dialog.Footer>
      {#if file_path}
        <Button
          variant="outline"
          onclick={() => {
            if (file_path) on_toggle_stage(file_path);
          }}
        >
          {is_staged ? "Unstage" : "Stage"}
        </Button>
      {/if}
      <Button variant="outline" onclick={on_close}>
        Close <span class="DiffViewer__kbd">Esc</span>
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  :global(.DiffViewer__dialog) {
    max-width: 56rem;
    width: 90vw;
    max-height: 80vh;
  }

  :global(.DiffViewer__title) {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  :global(.DiffViewer__title-icon) {
    width: var(--size-icon);
    height: var(--size-icon);
  }

  :global(.DiffViewer__description) {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    opacity: 0.7;
  }

  .DiffViewer__body {
    display: flex;
    flex-direction: column;
    min-height: 12rem;
    max-height: 50vh;
    overflow: hidden;
  }

  .DiffViewer__loading,
  .DiffViewer__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }

  .DiffViewer__stats {
    display: flex;
    gap: var(--space-2);
    padding-bottom: var(--space-2);
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
  }

  .DiffViewer__stat--add {
    color: var(--chart-2);
  }

  .DiffViewer__stat--del {
    color: var(--destructive);
  }

  .DiffViewer__content {
    flex: 1;
    overflow: auto;
  }

  .DiffViewer__kbd {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-2xs);
    padding: 1px var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    opacity: 0.6;
    margin-inline-start: var(--space-1);
  }
</style>
