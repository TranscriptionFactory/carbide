import { describe, expect, it } from "vitest";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import {
  create_open_note_state,
  create_test_note,
} from "../helpers/test_fixtures";

describe("EditorStore", () => {
  it("updates markdown and dirty state for open note", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");
    const open_note = create_open_note_state(note);

    store.set_open_note(open_note);
    store.set_markdown(note.id, as_markdown_text("# Updated"));
    store.set_dirty(note.id, true);

    expect(store.open_note?.markdown).toBe(as_markdown_text("# Updated"));
    expect(store.open_note?.is_dirty).toBe(true);
  });

  it("updates note path and title", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/old", "old");

    store.set_open_note(create_open_note_state(note));
    store.update_open_note_path(as_note_path("docs/new-name.md"));

    expect(store.open_note?.meta.path).toBe(as_note_path("docs/new-name.md"));
    expect(store.open_note?.meta.title).toBe("new-name");
  });

  it("seeds last_saved_at from mtime_ms on set_open_note", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");
    note.mtime_ms = 1_700_000_000_000;

    store.set_open_note(create_open_note_state(note));

    expect(store.last_saved_at).toBe(1_700_000_000_000);
  });

  it("sets last_saved_at to null when mtime_ms is zero", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");
    const open_note = create_open_note_state(note);

    store.set_open_note(open_note);

    expect(store.last_saved_at).toBeNull();
  });

  it("updates last_saved_at and meta.mtime_ms when mark_clean is called with timestamp", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");

    store.set_open_note(create_open_note_state(note));
    store.set_dirty(note.id, true);
    store.mark_clean(note.id, 1_700_000_005_000);

    expect(store.open_note?.is_dirty).toBe(false);
    expect(store.last_saved_at).toBe(1_700_000_005_000);
    expect(store.open_note?.meta.mtime_ms).toBe(1_700_000_005_000);
  });

  it("preserves last_saved_at when mark_clean is called without timestamp", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");
    note.mtime_ms = 1_700_000_000_000;

    store.set_open_note(create_open_note_state(note));
    store.mark_clean(note.id);

    expect(store.last_saved_at).toBe(1_700_000_000_000);
  });

  it("clears last_saved_at on clear_open_note", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");
    note.mtime_ms = 1_700_000_000_000;

    store.set_open_note(create_open_note_state(note));
    store.clear_open_note();

    expect(store.last_saved_at).toBeNull();
  });

  it("clears last_saved_at on reset", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");
    note.mtime_ms = 1_700_000_000_000;

    store.set_open_note(create_open_note_state(note));
    store.reset();

    expect(store.last_saved_at).toBeNull();
  });

  it("resets cursor_offset and scroll_fraction on set_open_note", () => {
    const store = new EditorStore();
    const note1 = create_test_note("docs/note1", "note1");
    const note2 = create_test_note("docs/note2", "note2");

    store.set_open_note(create_open_note_state(note1));
    store.set_cursor_offset(42);
    store.set_scroll_fraction(0.75);

    store.set_open_note(create_open_note_state(note2));

    expect(store.cursor_offset).toBe(0);
    expect(store.scroll_fraction).toBe(0);
  });

  it("tracks and clears selection for the open note", () => {
    const store = new EditorStore();
    const note = create_test_note("docs/note", "note");

    store.set_open_note(create_open_note_state(note));
    store.set_selection(note.id, {
      text: "note",
      start: 0,
      end: 4,
    });

    expect(store.selection).toEqual({
      text: "note",
      start: 0,
      end: 4,
    });

    store.clear_open_note();

    expect(store.selection).toBeNull();
  });
});
