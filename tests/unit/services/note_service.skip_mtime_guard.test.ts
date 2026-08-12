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

function setup(mtime_ms: number) {
  const vault_store = new VaultStore();
  const notes_store = new NotesStore();
  const editor_store = new EditorStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());

  editor_store.set_open_note({
    meta: {
      id: NOTE_PATH,
      path: NOTE_PATH,
      name: "alpha",
      title: "alpha",
      blurb: "",
      mtime_ms,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text("# Alpha"),
    buffer_id: "alpha-buffer",
    is_dirty: true,
  });

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
  );

  return { service, notes_port, editor_store };
}

function mark_dirty_again(editor_store: EditorStore) {
  const open_note = editor_store.open_note;
  if (!open_note) throw new Error("no open note");
  editor_store.set_open_note({ ...open_note, is_dirty: true });
}

// Characterization of the CURRENT contract, written before any behavioural
// change: "Keep my changes" zeroes the guard mtime, and the next successful
// save restamps it from the write's own result. The unguarded window is one
// save wide *only* while saves keep succeeding.
describe("NoteService skip_mtime_guard", () => {
  it("leaves only the next save unguarded when that save succeeds", async () => {
    const { service, notes_port, editor_store } = setup(100);
    const write_and_index = vi
      .fn()
      .mockResolvedValueOnce({ new_mtime: 200, parsed: null, diagnostics: [] })
      .mockResolvedValueOnce({ new_mtime: 300, parsed: null, diagnostics: [] });
    notes_port.write_and_index_note = write_and_index;

    service.skip_mtime_guard(NOTE_PATH);
    await service.save_note(null, true);
    mark_dirty_again(editor_store);
    await service.save_note(null, true);

    expect(write_and_index.mock.calls[0]?.[3]).toBeUndefined();
    expect(write_and_index.mock.calls[1]?.[3]).toBe(200);
    expect(editor_store.open_note?.meta.mtime_ms).toBe(300);
  });

  it("leaves every later save unguarded when the next save throws", async () => {
    const { service, notes_port, editor_store } = setup(100);
    const write_and_index = vi
      .fn()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValueOnce({ new_mtime: 300, parsed: null, diagnostics: [] })
      .mockResolvedValueOnce({ new_mtime: 400, parsed: null, diagnostics: [] });
    notes_port.write_and_index_note = write_and_index;

    service.skip_mtime_guard(NOTE_PATH);
    expect(await service.save_note(null, true)).toEqual({
      status: "failed",
      error: "disk full",
    });

    mark_dirty_again(editor_store);
    await service.save_note(null, true);
    mark_dirty_again(editor_store);
    await service.save_note(null, true);

    expect(write_and_index.mock.calls[0]?.[3]).toBeUndefined();
    expect(write_and_index.mock.calls[1]?.[3]).toBeUndefined();
    expect(write_and_index.mock.calls[2]?.[3]).toBe(300);
  });
});
