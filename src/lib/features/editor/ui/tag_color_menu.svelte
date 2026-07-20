<script lang="ts">
  import type { EditorView } from "prosemirror-view";
  import {
    tag_pill_plugin_key,
    type TagPillMenuConfig,
  } from "$lib/features/editor/adapters/tag_pill_plugin";
  import { Z_CONTEXT_MENU } from "$lib/features/editor/adapters/floating_toolbar_utils";
  import { ColorSwatchPicker } from "$lib/features/metadata";
  import { contain_focus } from "$lib/components/ui/contain_focus";

  let {
    view,
    config,
    on_close,
  }: {
    view: EditorView;
    config: TagPillMenuConfig;
    on_close: () => void;
  } = $props();

  const menu = $derived(tag_pill_plugin_key.getState(view.state)?.menu);
  const current_color = $derived(
    menu?.open ? config.get_color(menu.tag) : null,
  );

  let root_el = $state<HTMLElement | null>(null);

  function set_color(color: string) {
    if (!menu) return;
    config.on_set_color(menu.tag, color);
    on_close();
  }

  function clear_color() {
    if (!menu) return;
    config.on_clear_color(menu.tag);
    on_close();
  }

  $effect(() => {
    function handle_pointerdown(event: PointerEvent) {
      if (
        root_el &&
        event.target instanceof Node &&
        !root_el.contains(event.target)
      ) {
        on_close();
      }
    }
    function handle_keydown(event: KeyboardEvent) {
      if (event.key === "Escape") on_close();
    }
    window.addEventListener("pointerdown", handle_pointerdown, true);
    window.addEventListener("keydown", handle_keydown, true);
    return () => {
      window.removeEventListener("pointerdown", handle_pointerdown, true);
      window.removeEventListener("keydown", handle_keydown, true);
    };
  });
</script>

{#if menu?.open}
  <div
    bind:this={root_el}
    class="fixed"
    style="left: min({menu.clientX}px, calc(100vw - 15rem)); top: min({menu.clientY}px, calc(100vh - 10rem)); z-index: {Z_CONTEXT_MENU}"
    role="dialog"
    aria-label="Tag color"
    data-testid="tag-color-menu"
    use:contain_focus
  >
    <div
      class="flex w-56 flex-col gap-2 rounded-md border border-border bg-popover p-2 text-popover-foreground shadow-md"
    >
      <div class="truncate text-xs text-muted-foreground">#{menu.tag}</div>
      <ColorSwatchPicker value={current_color} on_select={set_color} />
      {#if current_color}
        <button
          type="button"
          class="h-7 rounded border border-border px-2 text-xs text-muted-foreground hover:bg-muted"
          onclick={clear_color}
          data-testid="tag-color-clear"
        >
          Remove color
        </button>
      {/if}
    </div>
  </div>
{/if}
