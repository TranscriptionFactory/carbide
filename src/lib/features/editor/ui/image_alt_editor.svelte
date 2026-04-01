<script lang="ts">
  import { onMount } from "svelte";
  import type { EditorView } from "prosemirror-view";
  import { X } from "@lucide/svelte/icons";

  let {
    view,
    pos,
    current_alt,
    x,
    y,
    on_close,
  }: {
    view: EditorView;
    pos: number;
    current_alt: string;
    x: number;
    y: number;
    on_close: () => void;
  } = $props();

  let input_el: HTMLInputElement | undefined;
  let value = $state(current_alt);

  onMount(() => {
    input_el?.focus();
    input_el?.select();
  });

  function save() {
    if (pos < 0) return;
    const node = view.state.doc.nodeAt(pos);
    if (!node) return;
    const tr = view.state.tr.setNodeMarkup(pos, undefined, {
      ...node.attrs,
      alt: value,
    });
    view.dispatch(tr);
    on_close();
  }

  function handle_keydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    } else if (e.key === "Escape") {
      e.preventDefault();
      on_close();
    }
  }
</script>

<svelte:window onkeydown={handle_keydown} />

<div
  class="fixed rounded-md border bg-popover p-3 shadow-md"
  style="left: {x}px; top: {y}px; z-index: 70; width: 280px"
  onclick={(e) => e.stopPropagation()}
  onmousedown={(e) => e.stopPropagation()}
>
  <div class="mb-2 flex items-center justify-between">
    <span class="text-sm font-medium">Edit Alt Text</span>
    <button
      type="button"
      class="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
      onclick={on_close}
    >
      <X class="h-4 w-4" />
    </button>
  </div>
  <input
    bind:this={input_el}
    bind:value
    class="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    placeholder="Describe the image..."
    onkeydown={handle_keydown}
    onblur={save}
  />
</div>
