<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OpenNoteState } from "$lib/shared/types/editor";
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "$lib/components/ui/button";
  import { DRAG_MIME } from "$lib/shared/constants/drag_types";

  const { stores, action_registry, secondary_editor_manager } =
    use_app_context();

  const secondary_tab = $derived(stores.tab.secondary_tab);
  const secondary_note = $derived(
    secondary_tab ? stores.tab.get_cached_note(secondary_tab.id) : null,
  );

  function mount_editor(node: HTMLDivElement, note: OpenNoteState) {
    void secondary_editor_manager.mount(note, node);

    return {
      update(new_note: OpenNoteState) {
        void secondary_editor_manager.mount(new_note, node);
      },
      destroy() {
        secondary_editor_manager.unmount();
      },
    };
  }

  function handle_close() {
    const tab = stores.tab.secondary_tab;
    if (tab) {
      void action_registry.execute(ACTION_IDS.tab_close, tab.id);
    }
  }

  function handle_focus() {
    void action_registry.execute(ACTION_IDS.tab_set_active_pane, "secondary");
  }

  function handle_header_dragstart(event: DragEvent) {
    if (!event.dataTransfer || !secondary_tab) return;
    const path =
      secondary_tab.kind === "note"
        ? secondary_tab.note_path
        : secondary_tab.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME.SPLIT_PANE, path);
    event.dataTransfer.setData("text/plain", secondary_tab.title);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="SecondaryNoteEditor" onclick={handle_focus}>
  <div
    class="SecondaryNoteEditor__header"
    draggable="true"
    ondragstart={handle_header_dragstart}
  >
    <span class="SecondaryNoteEditor__title">
      {secondary_tab?.title ?? "Side Panel"}
    </span>
    <Button variant="ghost" size="icon" onclick={handle_close}>
      <XIcon />
    </Button>
  </div>
  {#if secondary_note}
    <div
      use:mount_editor={secondary_note}
      class="SecondaryNoteEditor__content"
    ></div>
  {:else}
    <div class="SecondaryNoteEditor__empty">
      <p>No file open</p>
    </div>
  {/if}
</div>

<style>
  .SecondaryNoteEditor {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .SecondaryNoteEditor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
    min-height: calc(var(--space-8) + var(--space-1));
    position: relative;
    z-index: 1;
  }

  .SecondaryNoteEditor__title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .SecondaryNoteEditor__content {
    flex: 1;
    overflow-y: auto;
    width: 100%;
    position: relative;
    z-index: 0;
  }

  .SecondaryNoteEditor__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
