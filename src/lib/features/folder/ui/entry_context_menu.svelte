<script lang="ts">
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import {
    Star,
    StarOff,
    Copy,
    Pencil,
    Trash2,
    FolderOpen,
    ExternalLink,
    Columns2,
    AppWindow,
  } from "@lucide/svelte";
  import { toast } from "$lib/shared/ui/toast";

  let {
    path,
    starred = false,
    on_toggle_star,
    on_open_to_side,
    on_open_in_new_window,
    on_reveal_in_finder,
    on_open_in_default_app,
    on_rename,
    on_delete,
  }: {
    path: string;
    starred?: boolean;
    on_toggle_star?: ((path: string) => void) | undefined;
    on_open_to_side?: ((path: string) => void) | undefined;
    on_open_in_new_window?: ((path: string) => void) | undefined;
    on_reveal_in_finder?: ((path: string) => void) | undefined;
    on_open_in_default_app?: ((path: string) => void) | undefined;
    on_rename?: ((path: string) => void) | undefined;
    on_delete?: ((path: string) => void) | undefined;
  } = $props();

  async function copy_path() {
    try {
      await navigator.clipboard.writeText(path);
      toast.success("Path copied");
    } catch {
      toast.error("Failed to copy path");
    }
  }
</script>

<ContextMenu.Portal>
  <ContextMenu.Content>
    {#if on_toggle_star}
      <ContextMenu.Item onSelect={() => on_toggle_star(path)}>
        {#if starred}
          <StarOff class="mr-2 h-4 w-4" />
          <span>Unstar</span>
        {:else}
          <Star class="mr-2 h-4 w-4" />
          <span>Star</span>
        {/if}
      </ContextMenu.Item>
    {/if}
    <ContextMenu.Item onSelect={copy_path}>
      <Copy class="mr-2 h-4 w-4" />
      <span>Copy Path</span>
    </ContextMenu.Item>
    {#if on_open_to_side}
      <ContextMenu.Item onSelect={() => on_open_to_side(path)}>
        <Columns2 class="mr-2 h-4 w-4" />
        <span>Open to Side</span>
      </ContextMenu.Item>
    {/if}
    {#if on_open_in_new_window}
      <ContextMenu.Item onSelect={() => on_open_in_new_window(path)}>
        <AppWindow class="mr-2 h-4 w-4" />
        <span>Open in New Window</span>
      </ContextMenu.Item>
    {/if}
    {#if on_reveal_in_finder}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => on_reveal_in_finder(path)}>
        <FolderOpen class="mr-2 h-4 w-4" />
        <span>Reveal in File Manager</span>
      </ContextMenu.Item>
    {/if}
    {#if on_open_in_default_app}
      <ContextMenu.Item onSelect={() => on_open_in_default_app(path)}>
        <ExternalLink class="mr-2 h-4 w-4" />
        <span>Open in Default App</span>
      </ContextMenu.Item>
    {/if}
    {#if on_rename || on_delete}
      <ContextMenu.Separator />
      {#if on_rename}
        <ContextMenu.Item onSelect={() => on_rename(path)}>
          <Pencil class="mr-2 h-4 w-4" />
          <span>Rename</span>
        </ContextMenu.Item>
      {/if}
      {#if on_delete}
        <ContextMenu.Item onSelect={() => on_delete(path)}>
          <Trash2 class="mr-2 h-4 w-4" />
          <span>Delete</span>
        </ContextMenu.Item>
      {/if}
    {/if}
  </ContextMenu.Content>
</ContextMenu.Portal>
