import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { EditorService } from "$lib/features/editor";
import type { SecondaryEditorManager } from "$lib/features/tab";
import type { AssetsPort } from "$lib/features/note";
import { as_markdown_text } from "$lib/shared/types/ids";
import {
  create_open_note_state,
  create_test_note,
  create_test_vault,
} from "../helpers/test_fixtures";
import {
  create_mock_index_port,
  create_mock_notes_port,
} from "../helpers/mock_ports";

describe("NoteService block-link updates", () => {
  it.each([false, true])(
    "updates and saves a live secondary target (initial dirty: %s)",
    async (is_dirty) => {
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());
      const notes_store = new NotesStore();
      const primary_store = new EditorStore();
      const secondary_store = new EditorStore();
      const target = create_open_note_state(
        create_test_note("target", "Target"),
        "target claim\n\nunsaved edit",
      );
      target.is_dirty = is_dirty;
      secondary_store.set_open_note(target);

      let live_markdown = target.markdown;
      const secondary_editor = {
        get_live_markdown: vi.fn(() => live_markdown),
        sync_visual_from_markdown_undoable: vi.fn((markdown: string) => {
          live_markdown = as_markdown_text(markdown);
        }),
        flush: vi.fn(() => null),
        mark_clean: vi.fn(),
      } as unknown as EditorService;
      const secondary_manager = {
        get_open_note: vi.fn(() => secondary_store.open_note),
        get_editor: vi.fn(() => secondary_editor),
        get_editor_store: vi.fn(() => secondary_store),
        is_active: vi.fn(() => true),
        get_active_pane: vi.fn(() => "secondary"),
        propagate_mtime: vi.fn(),
      } as unknown as SecondaryEditorManager;
      const primary_editor = {
        get_live_markdown: vi.fn(() => null),
      } as unknown as EditorService;
      const notes_port = create_mock_notes_port();
      notes_port.write_and_index_note = vi.fn().mockResolvedValue({
        new_mtime: 52,
        blurb: "",
        color: null,
        icon: null,
      });
      const service = new NoteService(
        notes_port,
        create_mock_index_port(),
        {} as AssetsPort,
        vault_store,
        notes_store,
        primary_store,
        new OpStore(),
        primary_editor,
        () => 1,
        null,
        undefined,
        secondary_manager,
      );

      const committed = await service.commit_authoritative_markdown(
        target.meta.path,
        target.markdown,
        as_markdown_text("target claim ^mint01\n\nunsaved edit"),
      );

      expect(committed).toBe(true);
      expect(
        secondary_editor.sync_visual_from_markdown_undoable,
      ).toHaveBeenCalledWith("target claim ^mint01\n\nunsaved edit");
      expect(notes_port.write_and_index_note).toHaveBeenCalledWith(
        expect.any(String),
        target.meta.id,
        as_markdown_text("target claim ^mint01\n\nunsaved edit"),
        undefined,
      );
    },
  );
});
