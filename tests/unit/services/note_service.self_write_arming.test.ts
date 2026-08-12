import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { EditorService } from "$lib/features/editor/application/editor_service";
import type { AssetsPort } from "$lib/features/note/ports";

const NOTE_PATH = as_note_path("docs/alpha.md");

function note_meta(path = NOTE_PATH) {
  return {
    id: path,
    path,
    name: "alpha",
    title: "alpha",
    blurb: "",
    mtime_ms: 100,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function setup() {
  const vault_store = new VaultStore();
  const notes_store = new NotesStore();
  const editor_store = new EditorStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());
  notes_store.set_notes([note_meta()]);

  const notes_port = create_mock_notes_port();
  const index_port = create_mock_index_port();
  const assets_port = {
    resolve_asset_url: vi.fn(),
    write_image_asset: vi.fn(),
  } as unknown as AssetsPort;
  const editor_service = {
    flush: vi.fn().mockReturnValue(null),
    mark_clean: vi.fn(),
    rename_buffer: vi.fn(),
  } as unknown as EditorService;
  const on_file_written =
    vi.fn<
      (path: string, detail?: { mtime_ms?: number; kind?: string }) => void
    >();

  const service = new NoteService(
    notes_port,
    index_port,
    assets_port,
    vault_store,
    notes_store,
    editor_store,
    op_store,
    editor_service,
    () => 1,
    null,
    on_file_written,
  );

  return { service, notes_port, editor_store, on_file_written };
}

function open_dirty_note(editor_store: EditorStore) {
  editor_store.set_open_note({
    meta: note_meta(),
    markdown: as_markdown_text("# Alpha"),
    buffer_id: "alpha-buffer",
    is_dirty: true,
  });
}

describe("NoteService self-write arming", () => {
  it("records the written mtime after a successful save", async () => {
    const { service, notes_port, editor_store, on_file_written } = setup();
    open_dirty_note(editor_store);
    notes_port.write_and_index_note = vi
      .fn()
      .mockResolvedValue({ new_mtime: 900, parsed: null, diagnostics: [] });

    await service.save_note(null, true);

    expect(on_file_written).toHaveBeenNthCalledWith(1, NOTE_PATH);
    expect(on_file_written).toHaveBeenNthCalledWith(2, NOTE_PATH, {
      mtime_ms: 900,
    });
  });

  it("does not record an mtime when the write throws", async () => {
    const { service, notes_port, editor_store, on_file_written } = setup();
    open_dirty_note(editor_store);
    notes_port.write_and_index_note = vi
      .fn()
      .mockRejectedValue(new Error("disk full"));

    await service.save_note(null, true);

    expect(on_file_written).toHaveBeenCalledTimes(1);
    expect(on_file_written).toHaveBeenCalledWith(NOTE_PATH);
  });

  it("arms a removal before deleting a note", async () => {
    const { service, on_file_written } = setup();

    await service.delete_note(note_meta());

    expect(on_file_written).toHaveBeenCalledWith(NOTE_PATH, {
      kind: "removal",
    });
  });

  it("arms both sides of a rename", async () => {
    const { service, on_file_written } = setup();
    const target = as_note_path("docs/beta.md");

    await service.rename_note(note_meta(), target, false);

    expect(on_file_written).toHaveBeenCalledWith(NOTE_PATH, {
      kind: "removal",
    });
    expect(on_file_written).toHaveBeenCalledWith(target);
  });
});
