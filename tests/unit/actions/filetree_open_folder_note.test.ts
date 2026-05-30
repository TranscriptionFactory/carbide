import { describe, it, expect, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_folder_actions } from "$lib/features/folder/application/folder_actions";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import type { NoteMeta } from "$lib/shared/types/note";
import { as_note_path } from "$lib/shared/types/ids";

function make_note(path: string): NoteMeta {
  return {
    id: as_note_path(path) as never,
    path: as_note_path(path),
    name: path.split("/").pop()!.replace(".md", ""),
    title: path.split("/").pop()!.replace(".md", ""),
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: "markdown",
  };
}

function build_input(notes: NoteMeta[]) {
  const registry = new ActionRegistry();
  const notes_store = new NotesStore();
  notes_store.set_notes(notes);

  const note_open = vi.fn();
  registry.register({
    id: ACTION_IDS.note_open,
    label: "Open Note",
    execute: note_open,
  });

  // Minimal stub: register_folder_actions touches many stores but
  // filetree_open_folder_note only reads notes_store.notes + dispatches note_open.
  const input = {
    registry,
    stores: { notes: notes_store } as never,
    services: {} as never,
  } as never;

  register_folder_actions(input);
  return { registry, note_open };
}

describe("filetree_open_folder_note action", () => {
  it("opens folder/folder.md when present", async () => {
    const { registry, note_open } = build_input([
      make_note("Projects/Projects.md"),
      make_note("Projects/launch.md"),
    ]);

    await registry.execute(ACTION_IDS.filetree_open_folder_note, "Projects");

    expect(note_open).toHaveBeenCalledWith("Projects/Projects.md");
  });

  it("does nothing when no folder note is present", async () => {
    const { registry, note_open } = build_input([
      make_note("Projects/launch.md"),
    ]);

    await registry.execute(ACTION_IDS.filetree_open_folder_note, "Projects");

    expect(note_open).not.toHaveBeenCalled();
  });

  it("ignores empty folder paths", async () => {
    const { registry, note_open } = build_input([make_note("a.md")]);

    await registry.execute(ACTION_IDS.filetree_open_folder_note, "");

    expect(note_open).not.toHaveBeenCalled();
  });

  it("supports nested folder notes", async () => {
    const { registry, note_open } = build_input([
      make_note("Work/Q2/Q2.md"),
      make_note("Work/Q2/notes.md"),
    ]);

    await registry.execute(ACTION_IDS.filetree_open_folder_note, "Work/Q2");

    expect(note_open).toHaveBeenCalledWith("Work/Q2/Q2.md");
  });
});
