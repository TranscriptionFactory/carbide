import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";
import type { EditorService } from "$lib/features/editor/application/editor_service";
import type { AssetsPort } from "$lib/features/note/ports";

const note = { ...create_test_note("docs/a", "a"), mtime_ms: 100 };

function setup(is_dirty: boolean) {
  const vault_store = new VaultStore();
  const notes_store = new NotesStore();
  const editor_store = new EditorStore();
  const op_store = new OpStore();
  vault_store.set_vault(create_test_vault());
  editor_store.set_open_note({
    ...create_open_note_state(note, "# a"),
    is_dirty,
  });

  const notes_port = create_mock_notes_port();
  const assets_port = {
    resolve_asset_url: vi.fn(),
    write_image_asset: vi.fn(),
  } as unknown as AssetsPort;
  const editor_service = {
    flush: vi.fn().mockReturnValue(null),
    mark_clean: vi.fn(),
    rename_buffer: vi.fn(),
    sync_visual_from_markdown: vi.fn(),
  };

  const service = new NoteService(
    notes_port,
    create_mock_index_port(),
    assets_port,
    vault_store,
    notes_store,
    editor_store,
    op_store,
    editor_service as unknown as EditorService,
    () => 1,
  );

  return { service, notes_port, editor_service, op_store };
}

describe("NoteService save on a clean buffer", () => {
  it("reports saved without writing when nothing changed", async () => {
    const { service, notes_port, editor_service, op_store } = setup(false);

    const result = await service.save_note(null, true);

    expect(result).toEqual({
      status: "saved",
      saved_path: as_note_path("docs/a.md"),
    });
    expect(notes_port._calls.write_note).toHaveLength(0);
    expect(editor_service.mark_clean).not.toHaveBeenCalled();
    expect(op_store.get("note.save").status).toBe("idle");
  });

  it("writes when the buffer is dirty", async () => {
    const { service, notes_port } = setup(true);

    await service.save_note(null, true);

    expect(notes_port._calls.write_note).toHaveLength(1);
  });

  it("still overwrites the disk after the mtime guard was skipped", async () => {
    const { service, notes_port } = setup(false);

    service.skip_mtime_guard(note.id);
    await service.save_note(null, true);

    expect(notes_port._calls.write_note).toHaveLength(1);
  });
});
