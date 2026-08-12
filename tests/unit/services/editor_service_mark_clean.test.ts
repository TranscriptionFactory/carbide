import { describe, expect, it, vi } from "vitest";
import type {
  EditorPort,
  EditorSession,
  EditorSessionConfig,
} from "$lib/features/editor/ports";
import {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function create_open_note(note_path: string, markdown: string): OpenNoteState {
  const path = as_note_path(note_path);
  return {
    meta: {
      id: path,
      path,
      name: note_path.split("/").at(-1)?.replace(/\.md$/i, "") ?? "",
      title: note_path.replace(/\.md$/i, ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: markdown.length,
      file_type: null,
    },
    markdown: as_markdown_text(markdown),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_session(initial_markdown: string): EditorSession {
  let current_markdown = initial_markdown;
  return {
    destroy: vi.fn(),
    set_markdown: vi.fn((markdown: string) => {
      current_markdown = markdown;
    }),
    get_markdown: vi.fn(() => current_markdown),
    insert_text_at_cursor: vi.fn(),
    replace_selection: vi.fn(),
    get_selected_text: vi.fn(() => null),
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
  };
}

function create_setup(
  start_session: (config: EditorSessionConfig) => Promise<EditorSession>,
) {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());

  const editor_port: EditorPort = {
    start_session: vi.fn((config: EditorSessionConfig) =>
      start_session(config),
    ),
  };

  const callbacks: EditorServiceCallbacks = {
    on_internal_link_click: vi.fn(),
    on_external_link_click: vi.fn(),
    on_image_paste_requested: vi.fn(),
    on_file_drop_requested: vi.fn(),
  };

  const service = new EditorService(
    editor_port,
    vault_store,
    editor_store,
    op_store,
    callbacks,
  );

  return { service, editor_store };
}

describe("EditorService.mark_clean() with written bytes", () => {
  it("re-dirties when the visual document moved past what was written", async () => {
    const session = create_session("# written");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const note = create_open_note("docs/note.md", "# written");

    editor_store.set_open_note(note);
    await service.mount({ root: {} as HTMLDivElement, note });

    session.set_markdown("# written and typed");

    service.mark_clean("# written");

    expect(session.mark_clean).toHaveBeenCalledWith("# written");
    expect(editor_store.open_note?.is_dirty).toBe(true);
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# written and typed"),
    );
  });

  it("stays clean when the visual document matches what was written", async () => {
    const session = create_session("# written");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const note = create_open_note("docs/note.md", "# written");

    editor_store.set_open_note(note);
    editor_store.set_dirty(note.meta.id, false);
    await service.mount({ root: {} as HTMLDivElement, note });

    service.mark_clean("# written");

    expect(editor_store.open_note?.is_dirty).toBe(false);
  });

  it("re-dirties from the source pane, not the stale ProseMirror doc", async () => {
    const session = create_session("# stale visual");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const note = create_open_note("docs/note.md", "# written");

    editor_store.set_open_note(note);
    await service.mount({ root: {} as HTMLDivElement, note });
    editor_store.set_editor_mode("source");
    editor_store.set_source_content_getter(() => "# written and typed");

    service.mark_clean("# written");

    expect(editor_store.open_note?.is_dirty).toBe(true);
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# written and typed"),
    );
  });

  it("does not re-dirty in source mode when the source pane matches the write", async () => {
    const session = create_session("# stale visual");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const note = create_open_note("docs/note.md", "# written");

    editor_store.set_open_note(note);
    await service.mount({ root: {} as HTMLDivElement, note });
    editor_store.set_editor_mode("source");
    editor_store.set_source_content_getter(() => "# written");

    service.mark_clean("# written");

    expect(session.mark_clean).toHaveBeenCalledWith("# written");
    expect(editor_store.open_note?.is_dirty).toBe(false);
  });

  // Split view keeps the visual mode but hands document authority to the source
  // pane, so a ProseMirror doc that agrees with the write must not be the one
  // answering: only the source pane knows the buffer moved on.
  it("re-dirties from the source pane in split view, where the visual doc agrees with the write", async () => {
    const session = create_session("# written");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const note = create_open_note("docs/note.md", "# written");

    editor_store.set_open_note(note);
    await service.mount({ root: {} as HTMLDivElement, note });
    editor_store.set_split_view(true);
    editor_store.set_source_content_getter(() => "# written and typed");

    service.mark_clean("# written");

    expect(editor_store.editor_mode).toBe("visual");
    expect(editor_store.open_note?.is_dirty).toBe(true);
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# written and typed"),
    );
  });

  it("leaves the dirty decision to the session when called without bytes", async () => {
    const session = create_session("# written");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const note = create_open_note("docs/note.md", "# written");

    editor_store.set_open_note(note);
    await service.mount({ root: {} as HTMLDivElement, note });

    session.set_markdown("# written and typed");

    service.mark_clean();

    expect(session.mark_clean).toHaveBeenCalledWith(
      as_markdown_text("# written"),
    );
    expect(editor_store.open_note?.is_dirty).toBe(false);
  });
});
