import { describe, expect, it, vi } from "vitest";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { load_linked_source_folder } from "$lib/features/folder/application/filetree_action_helpers";
import { build_filetree } from "$lib/features/folder/domain/filetree";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { LinkedNoteInfo } from "$lib/features/reference/types";

function make_linked_note(path: string): LinkedNoteInfo {
  return {
    path,
    title: path.slice(path.lastIndexOf("/") + 1),
    mtime_ms: 0,
    linked_source_id: "source-1",
  };
}

function build_input(linked_notes: LinkedNoteInfo[]) {
  const query_all_linked_notes = vi.fn(() => Promise.resolve(linked_notes));
  const notes_store = new NotesStore();
  notes_store.add_folder_path("@linked");
  notes_store.add_folder_path("@linked/papers");

  const input = {
    stores: {
      notes: notes_store,
      vault: { vault: { id: "vault-1" } },
      reference: {
        linked_sources: [
          { id: "source-1", name: "papers", enabled: true, path: "/refs" },
        ],
      },
      ui: {
        filetree: {
          expanded_paths: new SvelteSet<string>(),
          load_states: new SvelteMap(),
          error_messages: new SvelteMap(),
          pagination: new SvelteMap(),
        },
      },
    },
    services: {
      reference: { query_all_linked_notes },
    },
  } as unknown as ActionRegistrationInput;

  return { input, notes_store, query_all_linked_notes };
}

describe("load_linked_source_folder", () => {
  it("registers a folder for every subfolder the linked documents sit in", async () => {
    const { input, notes_store } = build_input([
      make_linked_note("@linked/papers/top.pdf"),
      make_linked_note("@linked/papers/2024/ml/deep.pdf"),
    ]);

    await load_linked_source_folder(input, "@linked/papers");

    expect(notes_store.folder_paths).toContain("@linked/papers/2024");
    expect(notes_store.folder_paths).toContain("@linked/papers/2024/ml");
    expect(notes_store.folder_paths).not.toContain(
      "@linked/papers/2024/ml/deep.pdf",
    );
  });

  it("renders nested documents under their subfolder, not at the source root", async () => {
    const { input, notes_store } = build_input([
      make_linked_note("@linked/papers/top.pdf"),
      make_linked_note("@linked/papers/2024/ml/deep.pdf"),
    ]);

    await load_linked_source_folder(input, "@linked/papers");

    const tree = build_filetree(notes_store.notes, notes_store.folder_paths);
    const source = tree.children.get("@linked")?.children.get("papers");
    const year = source?.children.get("2024");

    expect([...(source?.children.keys() ?? [])].sort()).toEqual([
      "2024",
      "top.pdf",
    ]);
    expect(year?.is_folder).toBe(true);
    expect(year?.children.get("ml")?.children.get("deep.pdf")?.note?.path).toBe(
      "@linked/papers/2024/ml/deep.pdf",
    );
  });

  it("loads the whole source when a nested subfolder is expanded", async () => {
    const { input, notes_store, query_all_linked_notes } = build_input([
      make_linked_note("@linked/papers/2024/ml/deep.pdf"),
    ]);

    await load_linked_source_folder(input, "@linked/papers/2024/ml");

    expect(query_all_linked_notes).toHaveBeenCalled();
    expect(notes_store.notes.map((n) => n.path)).toEqual([
      "@linked/papers/2024/ml/deep.pdf",
    ]);
  });

  it("replaces the source's notes without duplicating them on reload", async () => {
    const { input, notes_store } = build_input([
      make_linked_note("@linked/papers/2024/ml/deep.pdf"),
    ]);

    await load_linked_source_folder(input, "@linked/papers");
    await load_linked_source_folder(input, "@linked/papers/2024/ml");

    expect(notes_store.notes).toHaveLength(1);
  });
});
