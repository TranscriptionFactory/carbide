<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button";
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import {
    FolderSearch,
    Trash2,
    FolderOpen,
    AlertTriangle,
  } from "@lucide/svelte";

  const ctx = use_app_context();
  const ref_store = ctx.stores.reference;

  let processing = $state(false);

  const current = $derived(ref_store.missing_linked_sources[0] ?? null);
  const is_open = $derived(current !== null);

  function dismiss() {
    if (current) {
      ref_store.dismiss_missing_linked_source(current.source.id);
    }
  }

  async function relocate() {
    if (!current) return;
    processing = true;
    try {
      await ctx.action_registry.execute("reference.relocate_linked_source", {
        id: current.source.id,
      });
    } finally {
      processing = false;
    }
  }

  async function delete_data() {
    if (!current) return;
    processing = true;
    try {
      await ctx.action_registry.execute("reference.delete_linked_source_data", {
        id: current.source.id,
      });
    } finally {
      processing = false;
    }
  }
</script>

<Dialog.Root
  open={is_open}
  onOpenChange={(value: boolean) => {
    if (!value && !processing) dismiss();
  }}
>
  <Dialog.Content class="max-w-md">
    <Dialog.Header>
      <Dialog.Title class="flex items-center gap-2">
        <AlertTriangle class="w-4 h-4 text-warning" />
        Linked Source Not Found
      </Dialog.Title>
      <Dialog.Description>
        <span class="font-medium">"{current?.source.name}"</span> was not found at:
      </Dialog.Description>
    </Dialog.Header>

    {#if current}
      <div class="space-y-3">
        <code class="block text-xs bg-muted px-2 py-1.5 rounded break-all">
          {current.source.path}
        </code>
        <p class="text-sm text-muted-foreground">
          {current.item_count} indexed {current.item_count === 1
            ? "item"
            : "items"}
          from this source. Choose how to proceed:
        </p>
      </div>

      <div class="flex flex-col gap-2 mt-2">
        <Button
          variant="default"
          onclick={relocate}
          disabled={processing}
          class="justify-start"
        >
          <FolderSearch class="w-4 h-4 mr-2" />
          Relocate — pick new folder location
        </Button>
        <Button
          variant="outline"
          onclick={dismiss}
          disabled={processing}
          class="justify-start"
        >
          <FolderOpen class="w-4 h-4 mr-2" />
          Dismiss — keep indexed data, decide later
        </Button>
        <Button
          variant="destructive"
          onclick={delete_data}
          disabled={processing}
          class="justify-start"
        >
          <Trash2 class="w-4 h-4 mr-2" />
          Delete — remove source and all indexed data
        </Button>
      </div>
    {/if}
  </Dialog.Content>
</Dialog.Root>
