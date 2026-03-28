<script lang="ts">
  import { use_app_context } from "$lib/app/context/app_context.svelte";
  import { ACTION_IDS } from "$lib/app";
  import type { OpenNoteState } from "$lib/shared/types/editor";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import { HotkeyKey } from "$lib/features/hotkey";
  import { Button } from "$lib/components/ui/button";
  import { DocumentViewer } from "$lib/features/document";
  import { CanvasViewer } from "$lib/features/canvas";
  import { SourceEditor } from "$lib/features/editor";
  import { GraphTabView } from "$lib/features/graph";
  import { EditorContextMenu } from "$lib/features/editor";
  import { as_markdown_text } from "$lib/shared/types/ids";

  const { stores, action_registry } = use_app_context();

  const open_note = $derived(stores.editor.open_note);
  const editor_mode = $derived(stores.editor.editor_mode);
  const active_tab = $derived(stores.tab.active_tab);
  const is_canvas_tab = $derived(
    active_tab?.kind === "document" &&
      (active_tab.file_type === "canvas" ||
        active_tab.file_type === "excalidraw"),
  );
  const document_viewer_state = $derived(
    active_tab?.kind === "document"
      ? stores.document.get_viewer_state(active_tab.id)
      : undefined,
  );
  const document_content_state = $derived(
    active_tab?.kind === "document"
      ? stores.document.get_content_state(active_tab.id)
      : undefined,
  );

  const create_note_hotkey = $derived(
    stores.ui.hotkeys_config.bindings.find(
      (b) => b.action_id === ACTION_IDS.note_create,
    )?.key ?? null,
  );

  function mount_editor(node: HTMLDivElement, note: OpenNoteState) {
    void action_registry.execute(ACTION_IDS.app_editor_mount, node, note);

    return {
      destroy() {
        void action_registry.execute(ACTION_IDS.app_editor_unmount);
      },
    };
  }
</script>

<div class="NoteEditor">
  {#if active_tab?.kind === "graph"}
    <GraphTabView />
  {:else if is_canvas_tab && active_tab?.kind === "document"}
    <CanvasViewer
      tab_id={active_tab.id}
      file_path={active_tab.file_path}
      file_type={active_tab.file_type as "canvas" | "excalidraw"}
    />
  {:else if active_tab?.kind === "document" && document_viewer_state}
    <DocumentViewer
      viewer_state={document_viewer_state}
      content_state={document_content_state}
    />
  {:else if open_note}
    <div
      class="NoteEditor__visual-wrapper"
      class:NoteEditor__hidden={editor_mode !== "visual" &&
        editor_mode !== "read_only"}
    >
      <EditorContextMenu>
        <div
          use:mount_editor={open_note}
          class="NoteEditor__content"
          class:NoteEditor__read-only={editor_mode === "read_only"}
          class:show-line-numbers={stores.ui.editor_settings
            .source_editor_line_numbers}
          class:show-heading-markers={stores.ui.editor_settings
            .editor_heading_markers}
        ></div>
      </EditorContextMenu>
    </div>
    {#if editor_mode === "source"}
      {#key open_note.meta.id}
        <SourceEditor
          initial_markdown={open_note.markdown}
          initial_cursor_offset={stores.editor.cursor_offset}
          initial_scroll_fraction={stores.editor.scroll_fraction}
          show_line_numbers={stores.ui.editor_settings
            .source_editor_line_numbers}
          on_markdown_change={(md) =>
            stores.editor.set_markdown(open_note.meta.id, as_markdown_text(md))}
          on_dirty_change={(dirty) =>
            stores.editor.set_dirty(open_note.meta.id, dirty)}
          on_cursor_change={(cursor) =>
            stores.editor.set_cursor(open_note.meta.id, cursor)}
          on_selection_change={(selection) =>
            stores.editor.set_selection(open_note.meta.id, selection)}
          on_outline_change={(headings) =>
            stores.outline?.set_headings(headings)}
          on_destroy={(state) => {
            stores.editor.set_cursor_offset(state.cursor_offset);
            stores.editor.set_scroll_fraction(state.scroll_fraction);
          }}
        />
      {/key}
    {/if}
  {:else}
    <div class="NoteEditor__empty">
      <div class="NoteEditor__empty-content">
        <div class="NoteEditor__empty-icon">
          <FileTextIcon />
        </div>
        <p class="NoteEditor__empty-title">No note open</p>
        <p class="NoteEditor__empty-hint">
          Select a note from the sidebar or create a new one
        </p>
        <div class="NoteEditor__empty-actions">
          <Button
            variant="default"
            size="sm"
            onclick={() => void action_registry.execute(ACTION_IDS.note_create)}
          >
            <PlusIcon />
            New Note
          </Button>
          {#if create_note_hotkey}
            <span class="NoteEditor__empty-shortcut-label">or press</span>
            <HotkeyKey hotkey={create_note_hotkey} />
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .NoteEditor {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    height: 100%;
  }

  .NoteEditor__visual-wrapper {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .NoteEditor__content {
    width: 100%;
  }

  .NoteEditor__hidden {
    display: none;
  }

  .NoteEditor__read-only {
    opacity: 0.85;
    cursor: default;
  }

  .NoteEditor__empty {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
  }

  .NoteEditor__empty-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    text-align: center;
    padding: var(--space-6);
  }

  .NoteEditor__empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--size-icon-lg) * 2);
    height: calc(var(--size-icon-lg) * 2);
    border-radius: var(--radius-md);
    background-color: var(--muted);
    color: var(--muted-foreground);
  }

  :global(.NoteEditor__empty-icon svg) {
    width: var(--size-icon-lg);
    height: var(--size-icon-lg);
  }

  .NoteEditor__empty-title {
    font-size: var(--text-base);
    font-weight: 500;
    color: var(--foreground);
  }

  .NoteEditor__empty-hint {
    font-size: var(--text-sm);
    color: var(--muted-foreground);
    max-width: calc(var(--space-6) * 10);
  }

  .NoteEditor__empty-actions {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-2);
  }

  .NoteEditor__empty-shortcut-label {
    font-size: var(--text-xs);
    color: var(--muted-foreground);
  }
</style>
