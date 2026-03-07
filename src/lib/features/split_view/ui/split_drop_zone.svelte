<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { NotePath } from "$lib/shared/types/ids";

  const { stores, action_registry } = use_app_context();

  const visible = $derived(
    stores.ui.tab_drag_active && !stores.split_view.active,
  );

  let drag_over = $state(false);

  function handle_dragover(event: DragEvent) {
    if (!event.dataTransfer) return;
    if (!event.dataTransfer.types.includes("application/x-otterly-note-path"))
      return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    drag_over = true;
  }

  function handle_dragleave() {
    drag_over = false;
  }

  function handle_drop(event: DragEvent) {
    event.preventDefault();
    drag_over = false;

    if (!event.dataTransfer) return;
    const note_path = event.dataTransfer.getData(
      "application/x-otterly-note-path",
    );
    if (!note_path) return;

    void action_registry.execute(
      ACTION_IDS.split_view_open_to_side,
      note_path as NotePath,
    );
  }
</script>

{#if visible}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="SplitDropZone"
    class:SplitDropZone--over={drag_over}
    ondragover={handle_dragover}
    ondragleave={handle_dragleave}
    ondrop={handle_drop}
  >
    <span class="SplitDropZone__label">Open to Side</span>
  </div>
{/if}

<style>
  .SplitDropZone {
    position: absolute;
    inset: 0;
    right: 0;
    left: 50%;
    z-index: var(--z-dropdown);
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: color-mix(in oklch, var(--interactive) 8%, transparent);
    border-left: 2px dashed var(--interactive);
    transition:
      background-color var(--duration-fast) var(--ease-default),
      opacity var(--duration-fast) var(--ease-default);
    pointer-events: all;
  }

  .SplitDropZone--over {
    background-color: color-mix(in oklch, var(--interactive) 18%, transparent);
  }

  .SplitDropZone__label {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--interactive);
    pointer-events: none;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-md);
    background-color: var(--background);
    border: 1px solid var(--interactive);
  }
</style>
