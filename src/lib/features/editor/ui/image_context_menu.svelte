<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { EditorView } from "prosemirror-view";
  import {
    image_context_menu_plugin_key,
    type ImageContextMenuState,
  } from "$lib/features/editor/adapters/image_context_menu_plugin";
  import { Z_CONTEXT_MENU } from "$lib/features/editor/adapters/floating_toolbar_utils";
  import {
    Copy,
    Link,
    ExternalLink,
    Download,
    Trash2,
    Pencil,
    Minus,
  } from "@lucide/svelte/icons";
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import ImageAltEditor from "./image_alt_editor.svelte";

  let { view, on_close }: { view: EditorView; on_close: () => void } = $props();

  const { action_registry } = use_app_context();

  const menu_state = $derived(
    image_context_menu_plugin_key.getState(view.state) as
      | ImageContextMenuState
      | undefined,
  );

  const is_open = $derived(menu_state?.open ?? false);
  let show_alt_editor = $state(false);

  const resize_presets = [25, 50, 75, 100] as const;

  function close() {
    show_alt_editor = false;
    on_close();
  }

  function execute_action(action_id: string, ...args: unknown[]) {
    void action_registry.execute(action_id, ...args);
    close();
  }

  function apply_resize(pct: number) {
    if (!menu_state || menu_state.pos < 0) return;
    const node = view.state.doc.nodeAt(menu_state.pos);
    if (!node) return;
    const current_width =
      typeof node.attrs["width"] === "string" ? node.attrs["width"] : "";
    const new_width =
      current_width === `${String(pct)}%` ? "" : `${String(pct)}%`;
    const tr = view.state.tr.setNodeMarkup(menu_state.pos, undefined, {
      ...node.attrs,
      width: new_width,
    });
    view.dispatch(tr);
    close();
  }

  function edit_alt_text() {
    show_alt_editor = true;
    close();
  }
</script>

{#if is_open && menu_state}
  <div
    class="fixed"
    style="left: {menu_state.clientX}px; top: {menu_state.clientY}px; z-index: {Z_CONTEXT_MENU}"
  >
    <ContextMenu.Root
      open={is_open}
      onOpenChange={(open) => {
        if (!open) close();
      }}
    >
      <ContextMenu.Trigger class="hidden" />
      <ContextMenu.Portal>
        <ContextMenu.Content>
          <ContextMenu.Item onSelect={edit_alt_text}>
            <Pencil class="mr-2 h-4 w-4" />
            Edit Alt Text
          </ContextMenu.Item>

          <ContextMenu.Separator />

          <ContextMenu.Sub>
            <ContextMenu.SubTrigger>
              <Minus class="mr-2 h-4 w-4" />
              Resize
            </ContextMenu.SubTrigger>
            <ContextMenu.SubContent>
              {#each resize_presets as pct}
                <ContextMenu.Item onSelect={() => apply_resize(pct)}>
                  {pct}%
                </ContextMenu.Item>
              {/each}
              <ContextMenu.Separator />
              <ContextMenu.Item onSelect={() => apply_resize(0)}>
                Original Size
              </ContextMenu.Item>
            </ContextMenu.SubContent>
          </ContextMenu.Sub>

          <ContextMenu.Separator />

          <ContextMenu.Item
            onSelect={() => execute_action(ACTION_IDS.image_copy)}
          >
            <Copy class="mr-2 h-4 w-4" />
            Copy Image
          </ContextMenu.Item>

          {#if menu_state.src}
            <ContextMenu.Item
              onSelect={() =>
                execute_action(ACTION_IDS.image_copy_url, menu_state.src)}
            >
              <Link class="mr-2 h-4 w-4" />
              Copy Image URL
            </ContextMenu.Item>
          {/if}

          <ContextMenu.Separator />

          <ContextMenu.Item
            onSelect={() =>
              execute_action(ACTION_IDS.image_open_in_browser, menu_state.src)}
          >
            <ExternalLink class="mr-2 h-4 w-4" />
            Open in Browser
          </ContextMenu.Item>

          {#if menu_state.isLocal}
            <ContextMenu.Item
              onSelect={() =>
                execute_action(ACTION_IDS.image_save_as, menu_state.src)}
            >
              <Download class="mr-2 h-4 w-4" />
              Save Image As...
            </ContextMenu.Item>
          {/if}

          <ContextMenu.Separator />

          <ContextMenu.Item
            onSelect={() =>
              execute_action(ACTION_IDS.image_delete, menu_state.pos)}
          >
            <Trash2 class="mr-2 h-4 w-4 text-destructive" />
            <span class="text-destructive">Delete Image</span>
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  </div>
{/if}

{#if show_alt_editor && menu_state}
  <ImageAltEditor
    {view}
    pos={menu_state.pos}
    current_alt={menu_state.alt}
    x={menu_state.clientX}
    y={menu_state.clientY}
    on_close={() => {
      show_alt_editor = false;
    }}
  />
{/if}
