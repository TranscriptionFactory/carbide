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

describe("EditorService.flush() - source mode", () => {
  it("uses source_content_getter when in source mode and getter is set", () => {
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(create_session("initial")),
    );
    const note = create_open_note("docs/note.md", "old content");

    editor_store.set_open_note(note);
    service.open_buffer(note);
    editor_store.set_editor_mode("source");
    editor_store.set_source_content_getter(() => "source editor content");

    const result = service.flush();

    expect(result).toEqual({
      note_id: as_note_path("docs/note.md"),
      markdown: as_markdown_text("source editor content"),
    });
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("source editor content"),
    );
  });

  it("falls back to store markdown when in source mode and getter is null", () => {
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(create_session("initial")),
    );
    const note = create_open_note("docs/note.md", "store markdown");

    editor_store.set_open_note(note);
    service.open_buffer(note);
    editor_store.set_editor_mode("source");
    editor_store.clear_source_content_getter();

    const result = service.flush();

    expect(result).toEqual({
      note_id: as_note_path("docs/note.md"),
      markdown: as_markdown_text("store markdown"),
    });
  });

  it("reads from ProseMirror session when in visual mode", async () => {
    const session = create_session("initial");
    const { service, editor_store } = create_setup(() =>
      Promise.resolve(session),
    );
    const root = {} as HTMLDivElement;
    const note = create_open_note("docs/note.md", "initial");

    editor_store.set_open_note(note);
    await service.mount({ root, note });

    session.set_markdown("visual editor content");

    const result = service.flush();

    expect(result).toEqual({
      note_id: as_note_path("docs/note.md"),
      markdown: as_markdown_text("visual editor content"),
    });
    expect(session.get_markdown).toHaveBeenCalled();
  });
});
