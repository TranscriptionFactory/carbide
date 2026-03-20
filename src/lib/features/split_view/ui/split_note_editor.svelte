<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OpenNoteState } from "$lib/shared/types/editor";
  import XIcon from "@lucide/svelte/icons/x";
  import { Button } from "$lib/components/ui/button";
  import { DRAG_MIME } from "$lib/shared/constants/drag_types";

  const { stores, action_registry } = use_app_context();

  const secondary_note = $derived(stores.split_view.secondary_note);
  const secondary_profile = $derived(stores.split_view.secondary_profile);

  function mount_editor(node: HTMLDivElement, note: OpenNoteState) {
    void action_registry.execute(ACTION_IDS.split_view_mount, node, note);

    return {
      update(new_note: OpenNoteState) {
        void action_registry.execute(
          ACTION_IDS.split_view_mount,
          node,
          new_note,
        );
      },
      destroy() {
        void action_registry.execute(ACTION_IDS.split_view_unmount);
      },
    };
  }

  function handle_close() {
    void action_registry.execute(ACTION_IDS.split_view_close);
  }

  function handle_focus() {
    void action_registry.execute(
      ACTION_IDS.split_view_set_active_pane,
      "secondary",
    );
  }

  function handle_header_dragstart(event: DragEvent) {
    if (!event.dataTransfer || !secondary_note) return;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(DRAG_MIME.SPLIT_PANE, secondary_note.meta.path);
    event.dataTransfer.setData("text/plain", secondary_note.meta.title);
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="SplitNoteEditor" onclick={handle_focus}>
  <div
    class="SplitNoteEditor__header"
    draggable="true"
    ondragstart={handle_header_dragstart}
  >
    <span class="SplitNoteEditor__title">
      {secondary_note?.meta.title ?? "Split View"}
    </span>
    <Button variant="ghost" size="icon" onclick={handle_close}>
      <XIcon />
    </Button>
  </div>
  {#if secondary_note}
    {#if secondary_profile === "full"}
      <div
        use:mount_editor={secondary_note}
        class="SplitNoteEditor__content"
      ></div>
    {:else}
      <div class="SplitNoteEditor__preview">
        {#if secondary_profile === "large-note-fallback"}
          <div class="SplitNoteEditor__preview-banner">
            Large note fallback mode
          </div>
        {/if}
        <pre
          class="SplitNoteEditor__preview-body">{secondary_note.markdown}</pre>
      </div>
    {/if}
  {:else}
    <div class="SplitNoteEditor__empty">
      <p>No file open in split view</p>
    </div>
  {/if}
</div>

<style>
  .SplitNoteEditor {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
  }

  .SplitNoteEditor__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-1) var(--space-2);
    border-bottom: 1px solid var(--border);
    min-height: calc(var(--space-8) + var(--space-1));
    position: relative;
    z-index: 1;
  }

  .SplitNoteEditor__title {
    font-size: var(--text-sm);
    font-weight: 500;
    color: var(--foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .SplitNoteEditor__content {
    flex: 1;
    overflow-y: auto;
    width: 100%;
    position: relative;
    z-index: 0;
  }

  .SplitNoteEditor__preview {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: var(--space-4);
    font-family: "SF Mono", "Fira Code", "Cascadia Code", "Consolas", monospace;
    font-size: var(--text-sm);
    line-height: 1.6;
    background: var(--background);
    color: var(--foreground);
  }

  .SplitNoteEditor__preview-banner {
    margin-bottom: var(--space-3);
    color: var(--muted-foreground);
    font-size: var(--text-xs);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .SplitNoteEditor__preview-body {
    white-space: pre-wrap;
    word-break: break-word;
  }

  .SplitNoteEditor__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--muted-foreground);
    font-size: var(--text-sm);
  }
</style>
