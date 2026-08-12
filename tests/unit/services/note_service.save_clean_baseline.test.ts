import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
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

const note = create_test_note("docs/a", "a");

function dirty_open_note(markdown: string) {
  return {
    ...create_open_note_state(note, markdown),
    is_dirty: true,
  };
}

function setup() {
  const vault_store = new VaultStore();
  const notes_store = new NotesStore();
  const editor_store = new EditorStore();
  const op_store = new OpStore();

  vault_store.set_vault(create_test_vault());

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
    sync_visual_from_markdown: vi.fn(),
  };

  const service = new NoteService(
    notes_port,
    index_port,
    assets_port,
    vault_store,
    notes_store,
    editor_store,
    op_store,
    editor_service as unknown as EditorService,
    () => 1,
  );

  // The store moving forward while the write is in flight is the whole point
  // of these cases: a serialize that lands mid-await pushes newer content in.
  function type_during_write(markdown: string) {
    const write = notes_port.write_and_index_note.bind(notes_port);
    vi.spyOn(notes_port, "write_and_index_note").mockImplementation(
      (...args) => {
        editor_store.set_markdown(note.id, as_markdown_text(markdown));
        return write(...args);
      },
    );
  }

  return {
    service,
    editor_store,
    notes_port,
    editor_service,
    type_during_write,
  };
}

describe("NoteService save baseline", () => {
  it("baselines the bytes it wrote when keystrokes land mid-write", async () => {
    const {
      service,
      editor_store,
      notes_port,
      editor_service,
      type_during_write,
    } = setup();
    editor_store.set_open_note(dirty_open_note("# raw"));
    type_during_write("# raw typed more");

    const result = await service.save_note(null, true);

    expect(result.status).toBe("saved");
    expect(notes_port._calls.write_note[0]?.markdown).toBe(
      as_markdown_text("# raw"),
    );
    expect(editor_service.mark_clean).toHaveBeenCalledWith(
      as_markdown_text("# raw"),
    );
  });

  it("never baselines a store value that is ahead of what was written", async () => {
    const { service, editor_store, editor_service, type_during_write } =
      setup();
    editor_store.set_open_note(dirty_open_note("# raw"));
    type_during_write("# unwritten");

    await service.save_note(null, true);

    expect(editor_service.mark_clean).toHaveBeenCalledWith(
      as_markdown_text("# raw"),
    );
    expect(editor_service.mark_clean).not.toHaveBeenCalledWith(
      as_markdown_text("# unwritten"),
    );
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# unwritten"),
    );
  });

  it("baselines the store snapshot when nothing moves during the write", async () => {
    const { service, editor_store, editor_service } = setup();
    editor_store.set_open_note(dirty_open_note("# raw"));

    await service.save_note(null, true);

    expect(editor_service.mark_clean).toHaveBeenCalledWith(
      as_markdown_text("# raw"),
    );
  });

  it("baselines the created bytes for an untitled note", async () => {
    const { service, editor_store, editor_service } = setup();
    const draft_meta = {
      ...create_test_note("untitled", "Untitled"),
      id: as_note_path("draft:1:Untitled"),
      path: as_note_path("draft:1:Untitled"),
    };
    editor_store.set_open_note({
      ...create_open_note_state(draft_meta, "# draft"),
      is_dirty: true,
    });

    const result = await service.save_note(as_note_path("docs/new.md"), false);

    expect(result.status).toBe("saved");
    expect(editor_service.mark_clean).toHaveBeenCalledWith(
      as_markdown_text("# draft"),
    );
  });
});
