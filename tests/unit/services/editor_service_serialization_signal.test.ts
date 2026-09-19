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
    mark_clean: vi.fn(),
    is_dirty: vi.fn(() => false),
    focus: vi.fn(),
    open_buffer: vi.fn(),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
  };
}

function create_setup() {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());

  const session_configs: EditorSessionConfig[] = [];
  const editor_port: EditorPort = {
    start_session: vi.fn((config: EditorSessionConfig) => {
      session_configs.push(config);
      return Promise.resolve(create_session(config.initial_markdown));
    }),
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
    new OpStore(),
    callbacks,
  );

  return { service, editor_store, session_configs };
}

describe("EditorService serialization signal", () => {
  it("mirrors the session's snapshot signal into the store", async () => {
    const { service, editor_store, session_configs } = create_setup();
    const note = create_open_note("docs/alpha.md", "# Alpha");
    editor_store.set_open_note(note);
    await service.mount({ root: {} as HTMLDivElement, note });

    const events = session_configs[0]?.events;
    expect(events?.on_doc_ahead_of_snapshot_change).toBeTypeOf("function");

    events?.on_doc_ahead_of_snapshot_change?.(true);
    expect(editor_store.doc_ahead_of_snapshot).toBe(true);

    events?.on_markdown_change("# Alpha\n");
    expect(editor_store.doc_ahead_of_snapshot).toBe(false);
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# Alpha\n"),
    );
  });

  it("clears the flag when the note is swapped", async () => {
    const { service, editor_store, session_configs } = create_setup();
    const first = create_open_note("docs/alpha.md", "# Alpha");
    editor_store.set_open_note(first);
    await service.mount({ root: {} as HTMLDivElement, note: first });

    session_configs[0]?.events.on_doc_ahead_of_snapshot_change?.(true);
    expect(editor_store.doc_ahead_of_snapshot).toBe(true);

    editor_store.set_open_note(create_open_note("docs/beta.md", "# Beta"));
    expect(editor_store.doc_ahead_of_snapshot).toBe(false);
  });
});
