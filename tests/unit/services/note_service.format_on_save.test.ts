import { describe, expect, it, vi } from "vitest";
import { NoteService } from "$lib/features/note/application/note_service";
import type { FormatOnSaveHook } from "$lib/features/note/application/note_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { MarkdownText } from "$lib/shared/types/ids";
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

function setup(format_on_save?: FormatOnSaveHook) {
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
    null,
    undefined,
    undefined,
    undefined,
    undefined,
    format_on_save,
  );

  return { service, editor_store, notes_port, editor_service };
}

describe("NoteService format-on-save", () => {
  it("formats the snapshot and writes formatted bytes in a single write", async () => {
    const hook = {
      format: vi.fn().mockResolvedValue(as_markdown_text("# formatted")),
      on_applied: vi.fn(),
    };
    const { service, editor_store, notes_port, editor_service } = setup(hook);
    editor_store.set_open_note(dirty_open_note("# raw"));

    const result = await service.save_note(null, true);

    expect(result.status).toBe("saved");
    expect(hook.format).toHaveBeenCalledWith(
      as_note_path(note.path),
      as_markdown_text("# raw"),
    );
    expect(notes_port._calls.write_note).toHaveLength(1);
    expect(notes_port._calls.write_note[0]?.markdown).toBe(
      as_markdown_text("# formatted"),
    );
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# formatted"),
    );
    expect(editor_service.sync_visual_from_markdown).toHaveBeenCalledWith(
      as_markdown_text("# formatted"),
    );
    expect(hook.on_applied).toHaveBeenCalledWith(
      as_note_path(note.path),
      as_markdown_text("# formatted"),
    );
  });

  it("writes the snapshot unchanged when the formatter has no edits", async () => {
    const hook = {
      format: vi.fn().mockResolvedValue(null),
      on_applied: vi.fn(),
    };
    const { service, editor_store, notes_port, editor_service } = setup(hook);
    editor_store.set_open_note(dirty_open_note("# raw"));

    const result = await service.save_note(null, true);

    expect(result.status).toBe("saved");
    expect(notes_port._calls.write_note).toHaveLength(1);
    expect(notes_port._calls.write_note[0]?.markdown).toBe(
      as_markdown_text("# raw"),
    );
    expect(editor_service.sync_visual_from_markdown).not.toHaveBeenCalled();
    expect(hook.on_applied).not.toHaveBeenCalled();
  });

  it("saves normally when no format hook is wired", async () => {
    const { service, editor_store, notes_port } = setup(undefined);
    editor_store.set_open_note(dirty_open_note("# raw"));

    const result = await service.save_note(null, true);

    expect(result.status).toBe("saved");
    expect(notes_port._calls.write_note).toHaveLength(1);
    expect(notes_port._calls.write_note[0]?.markdown).toBe(
      as_markdown_text("# raw"),
    );
  });

  it("saves unformatted when the formatter rejects", async () => {
    const hook = {
      format: vi.fn().mockRejectedValue(new Error("formatter exploded")),
      on_applied: vi.fn(),
    };
    const { service, editor_store, notes_port, editor_service } = setup(hook);
    editor_store.set_open_note(dirty_open_note("# raw"));

    const result = await service.save_note(null, true);

    expect(result.status).toBe("saved");
    expect(notes_port._calls.write_note).toHaveLength(1);
    expect(notes_port._calls.write_note[0]?.markdown).toBe(
      as_markdown_text("# raw"),
    );
    expect(editor_service.sync_visual_from_markdown).not.toHaveBeenCalled();
    expect(hook.on_applied).not.toHaveBeenCalled();
  });

  it("saves unformatted when the formatter times out", async () => {
    vi.useFakeTimers();
    try {
      const hook = {
        format: vi.fn().mockReturnValue(new Promise<never>(() => {})),
        on_applied: vi.fn(),
      };
      const { service, editor_store, notes_port } = setup(hook);
      editor_store.set_open_note(dirty_open_note("# raw"));

      const pending = service.save_note(null, true);
      await vi.advanceTimersByTimeAsync(2_000);
      const result = await pending;

      expect(result.status).toBe("saved");
      expect(notes_port._calls.write_note).toHaveLength(1);
      expect(notes_port._calls.write_note[0]?.markdown).toBe(
        as_markdown_text("# raw"),
      );
      expect(hook.on_applied).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("never loses keystrokes typed during the format await", async () => {
    let resolve_format: (value: MarkdownText) => void = () => {};
    const hook = {
      format: vi.fn().mockReturnValue(
        new Promise<MarkdownText>((resolve) => {
          resolve_format = resolve;
        }),
      ),
      on_applied: vi.fn(),
    };
    const { service, editor_store, notes_port, editor_service } = setup(hook);
    editor_store.set_open_note(dirty_open_note("# raw"));

    const pending = service.save_note(null, true);
    expect(hook.format).toHaveBeenCalled();

    // Keystrokes land while the formatter is running: the live document is
    // now newer than the snapshot, visible only through a forced flush.
    editor_service.flush.mockReturnValue({
      note_id: note.id,
      markdown: as_markdown_text("# raw plus keystrokes"),
    });
    resolve_format(as_markdown_text("# formatted"));
    const result = await pending;

    expect(result.status).toBe("saved");
    expect(notes_port._calls.write_note).toHaveLength(1);
    expect(notes_port._calls.write_note[0]?.markdown).toBe(
      as_markdown_text("# raw plus keystrokes"),
    );
    expect(editor_service.sync_visual_from_markdown).not.toHaveBeenCalled();
    expect(hook.on_applied).not.toHaveBeenCalled();
    expect(editor_store.open_note?.markdown).toBe(
      as_markdown_text("# raw plus keystrokes"),
    );
  });

  it("formats an untitled note against its target path before the first write", async () => {
    const hook = {
      format: vi.fn().mockResolvedValue(as_markdown_text("# formatted")),
      on_applied: vi.fn(),
    };
    const { service, editor_store, notes_port } = setup(hook);
    const draft_meta = {
      ...create_test_note("untitled", "Untitled"),
      id: as_note_path("draft:1:Untitled"),
      path: as_note_path("draft:1:Untitled"),
    };
    editor_store.set_open_note({
      ...create_open_note_state(draft_meta, "# raw"),
      is_dirty: true,
    });

    const result = await service.save_note(as_note_path("docs/new.md"), false);

    expect(result.status).toBe("saved");
    expect(hook.format).toHaveBeenCalledWith(
      as_note_path("docs/new.md"),
      as_markdown_text("# raw"),
    );
    expect(notes_port._calls.create_note).toHaveLength(1);
    expect(notes_port._calls.create_note[0]?.markdown).toBe(
      as_markdown_text("# formatted"),
    );
  });
});
