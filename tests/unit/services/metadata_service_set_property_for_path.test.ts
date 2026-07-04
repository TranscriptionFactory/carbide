import { describe, expect, it, vi } from "vitest";
import { MetadataService } from "$lib/features/metadata/application/metadata_service";
import { MetadataStore } from "$lib/features/metadata/state/metadata_store.svelte";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { MetadataPort } from "$lib/features/metadata/ports";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

function make_note(path: string): NoteMeta {
  return {
    id: path as NoteId,
    path: path as NotePath,
    name: path.split("/").pop()?.replace(".md", "") ?? "",
    title: path.split("/").pop()?.replace(".md", "") ?? "",
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function create_mock_editor_store(
  note_path: string | null,
  markdown: string = "",
): EditorStore {
  let open_note = note_path
    ? { meta: { id: note_path, path: note_path }, markdown, is_dirty: false }
    : null;
  return {
    get open_note() {
      return open_note;
    },
    set_markdown(_id: string, md: string) {
      if (open_note) open_note = { ...open_note, markdown: md };
    },
    set_dirty(_id: string, dirty: boolean) {
      if (open_note) open_note = { ...open_note, is_dirty: dirty };
    },
  } as unknown as EditorStore;
}

function create_harness(open_note_path: string | null, markdown: string = "") {
  const store = new MetadataStore();
  const notes_store = new NotesStore();
  const editor_store = create_mock_editor_store(open_note_path, markdown);
  const sync_visual = vi.fn();
  const editor_service = {
    sync_visual_from_markdown_undoable: sync_visual,
  } as unknown as EditorService;
  const update_property = vi.fn().mockResolvedValue(undefined);
  const port: MetadataPort = {
    get_file_cache: vi.fn().mockRejectedValue("not found"),
    list_properties: vi.fn().mockResolvedValue([]),
    update_property,
  };
  const service = new MetadataService(
    store,
    editor_store,
    editor_service,
    port,
    notes_store,
  );
  return { service, notes_store, editor_store, update_property, sync_visual };
}

describe("MetadataService.set_property_for_path", () => {
  it("routes through the editor when the target note is open", async () => {
    const { service, update_property, sync_visual } = create_harness(
      "Projects/Projects.md",
      "---\ncolor: red\n---\nbody",
    );

    await service.set_property_for_path(
      "vault-1",
      "Projects/Projects.md",
      "color",
      "blue",
    );

    expect(update_property).not.toHaveBeenCalled();
    expect(sync_visual).toHaveBeenCalledOnce();
  });

  it("writes through the port with a quoted hex value when the note is not open", async () => {
    const { service, update_property, sync_visual } = create_harness(null);

    await service.set_property_for_path(
      "vault-1",
      "Projects/Projects.md",
      "color",
      "#ff0000",
    );

    expect(sync_visual).not.toHaveBeenCalled();
    expect(update_property).toHaveBeenCalledWith(
      "vault-1",
      "Projects/Projects.md",
      "color",
      '"#ff0000"',
    );
  });

  it("patches the notes store so the tree restyles immediately", async () => {
    const { service, notes_store } = create_harness(null);
    notes_store.set_notes([make_note("Projects/Projects.md")]);

    await service.set_property_for_path(
      "vault-1",
      "Projects/Projects.md",
      "color",
      "teal",
    );
    await service.set_property_for_path(
      "vault-1",
      "Projects/Projects.md",
      "icon",
      "🚀",
    );

    expect(notes_store.notes[0]?.color).toBe("teal");
    expect(notes_store.notes[0]?.icon).toBe("🚀");
  });

  it("does not patch the notes store for non-visual keys", async () => {
    const { service, notes_store, update_property } = create_harness(null);
    notes_store.set_notes([make_note("Projects/Projects.md")]);

    await service.set_property_for_path(
      "vault-1",
      "Projects/Projects.md",
      "status",
      "active",
    );

    expect(update_property).toHaveBeenCalledWith(
      "vault-1",
      "Projects/Projects.md",
      "status",
      "active",
    );
    expect(notes_store.notes[0]?.color).toBeUndefined();
  });
});
