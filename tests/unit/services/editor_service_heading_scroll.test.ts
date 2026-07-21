import { describe, expect, it, vi } from "vitest";
import type {
  BufferConfig,
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
import { OutlineStore } from "$lib/features/outline";
import type { OutlineHeading } from "$lib/features/outline";
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

function heading(level: number, text: string, pos: number): OutlineHeading {
  const slug = text
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "");
  return { id: `h-${String(level)}-${slug}-0`, level, text, pos };
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
    open_buffer: vi.fn((config: BufferConfig) => {
      current_markdown = config.initial_markdown;
    }),
    rename_buffer: vi.fn(),
    close_buffer: vi.fn(),
    scroll_to_position: vi.fn(),
  };
}

async function create_setup() {
  const editor_store = new EditorStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  const outline_store = new OutlineStore();
  vault_store.set_vault(create_test_vault());

  const session = create_session("# Alpha");
  const session_configs: EditorSessionConfig[] = [];
  const editor_port: EditorPort = {
    start_session: vi.fn((config: EditorSessionConfig) => {
      session_configs.push(config);
      return Promise.resolve(session);
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
    op_store,
    callbacks,
    undefined,
    outline_store,
  );

  const note = create_open_note("docs/alpha.md", "# Alpha");
  editor_store.set_open_note(note);
  await service.mount({ root: {} as HTMLDivElement, note });

  const config = session_configs[0];
  if (!config) {
    throw new Error("Missing start_session config");
  }
  const emit_outline = config.events.on_outline_change;
  if (!emit_outline) {
    throw new Error("on_outline_change not wired");
  }

  return { service, editor_store, outline_store, session, emit_outline };
}

describe("EditorService heading fragment scroll", () => {
  it("scrolls immediately when outline already has headings for the active note", async () => {
    const { service, editor_store, session, emit_outline } =
      await create_setup();
    emit_outline([heading(1, "Alpha", 0), heading(2, "Section", 42)]);

    service.scroll_to_heading_fragment("Section");

    expect(session.scroll_to_position).toHaveBeenCalledWith(42);
    expect(editor_store.pending_heading_fragment).toBeNull();
  });

  it("does not stash a fragment that matches no heading in the current outline", async () => {
    const { service, editor_store, session, emit_outline } =
      await create_setup();
    emit_outline([heading(1, "Alpha", 0)]);

    service.scroll_to_heading_fragment("Missing");

    expect(session.scroll_to_position).not.toHaveBeenCalled();
    expect(editor_store.pending_heading_fragment).toBeNull();

    emit_outline([heading(1, "Alpha", 0), heading(2, "Missing", 7)]);
    expect(session.scroll_to_position).not.toHaveBeenCalled();
  });

  it("stashes the fragment while outline belongs to another note and consumes it once on emit", async () => {
    const { service, editor_store, session, emit_outline } =
      await create_setup();
    emit_outline([heading(1, "Alpha", 0)]);

    const beta = create_open_note("docs/beta.md", "# Beta\n## Overview");
    editor_store.set_open_note(beta);
    service.open_buffer(beta);

    service.scroll_to_heading_fragment("Overview");
    expect(session.scroll_to_position).not.toHaveBeenCalled();
    expect(editor_store.pending_heading_fragment).toBe("Overview");

    emit_outline([heading(1, "Beta", 0), heading(2, "Overview", 8)]);
    expect(session.scroll_to_position).toHaveBeenCalledTimes(1);
    expect(session.scroll_to_position).toHaveBeenCalledWith(8);
    expect(editor_store.pending_heading_fragment).toBeNull();

    emit_outline([heading(1, "Beta", 0), heading(2, "Overview", 8)]);
    expect(session.scroll_to_position).toHaveBeenCalledTimes(1);
  });
});
