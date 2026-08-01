<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { note_name_from_path } from "$lib/shared/utils/path";

  interface Props {
    open: boolean;
    paths: string[];
    is_discarding: boolean;
    on_confirm: () => void;
    on_cancel: () => void;
  }

  let { open, paths, is_discarding, on_confirm, on_cancel }: Props = $props();

  const single_path = $derived(paths.length === 1 ? paths[0] : undefined);
</script>

<Dialog.Root
  {open}
  onOpenChange={(value: boolean) => {
    if (!value && !is_discarding) on_cancel();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title>
        {single_path ? "Discard Changes" : "Discard All Changes"}
      </Dialog.Title>
      <Dialog.Description>
        {#if single_path}
          Discard your uncommitted changes to <span class="font-medium"
            >{note_name_from_path(single_path)}</span
          >? It will be reset to the last committed version, and any file that
          was never committed will be deleted. This cannot be undone.
        {:else}
          Discard your uncommitted changes to <span class="font-medium"
            >{paths.length} files</span
          >? They will be reset to the last committed version, and any file that
          was never committed will be deleted. This cannot be undone.
        {/if}
      </Dialog.Description>
    </Dialog.Header>

    {#if !single_path}
      <ul class="DiscardChanges__list">
        {#each paths as path (path)}
          <li class="DiscardChanges__path">{path}</li>
        {/each}
      </ul>
    {/if}

    <Dialog.Footer>
      <Button variant="outline" onclick={on_cancel} disabled={is_discarding}>
        Cancel
      </Button>
      <Button
        variant="destructive"
        onclick={on_confirm}
        disabled={is_discarding}
      >
        {#if is_discarding}
          Discarding...
        {:else}
          Discard
        {/if}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>

<style>
  .DiscardChanges__list {
    max-height: 10rem;
    overflow-y: auto;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: var(--space-2);
  }

  .DiscardChanges__path {
    font-family: var(--font-mono, monospace);
    font-size: var(--text-xs);
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
