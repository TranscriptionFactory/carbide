import { describe, expect, it } from "vitest";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";

describe("EditorStore mode", () => {
  it("defaults to visual mode", () => {
    const store = new EditorStore();
    expect(store.editor_mode).toBe("visual");
  });

  it("toggle_editor_mode cycles visual to source", () => {
    const store = new EditorStore();
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("source");
  });

  it("toggle_editor_mode cycles source back to visual", () => {
    const store = new EditorStore();
    store.toggle_editor_mode();
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("visual");
  });

  it("toggle_editor_mode cycles read_only to visual", () => {
    const store = new EditorStore();
    store.set_editor_mode("read_only");
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("visual");
  });

  it("full cycle visual → source → visual", () => {
    const store = new EditorStore();
    expect(store.editor_mode).toBe("visual");
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("source");
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("visual");
  });

  it("set_editor_mode sets mode", () => {
    const store = new EditorStore();
    store.set_editor_mode("source");
    expect(store.editor_mode).toBe("source");
  });

  it("set_editor_mode no-ops on same mode", () => {
    const store = new EditorStore();
    store.set_editor_mode("visual");
    expect(store.editor_mode).toBe("visual");
  });

  it("set_cursor_offset stores value", () => {
    const store = new EditorStore();
    store.set_cursor_offset(42);
    expect(store.cursor_offset).toBe(42);
  });

  it("set_scroll_fraction stores value", () => {
    const store = new EditorStore();
    store.set_scroll_fraction(0.75);
    expect(store.scroll_fraction).toBe(0.75);
  });

  it("reset clears mode state", () => {
    const store = new EditorStore();
    store.set_editor_mode("source");
    store.set_cursor_offset(100);
    store.set_scroll_fraction(0.5);
    store.set_split_view(true);
    store.reset();
    expect(store.editor_mode).toBe("visual");
    expect(store.split_view).toBe(false);
    expect(store.cursor_offset).toBe(0);
    expect(store.scroll_fraction).toBe(0);
  });
});

describe("EditorStore split_view", () => {
  it("defaults to false", () => {
    const store = new EditorStore();
    expect(store.split_view).toBe(false);
  });

  it("toggle_split_view toggles the value", () => {
    const store = new EditorStore();
    store.toggle_split_view();
    expect(store.split_view).toBe(true);
    store.toggle_split_view();
    expect(store.split_view).toBe(false);
  });

  it("set_split_view sets the value", () => {
    const store = new EditorStore();
    store.set_split_view(true);
    expect(store.split_view).toBe(true);
    store.set_split_view(false);
    expect(store.split_view).toBe(false);
  });

  it("split_view is independent of editor_mode", () => {
    const store = new EditorStore();
    store.set_split_view(true);
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("source");
    expect(store.split_view).toBe(true);
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("visual");
    expect(store.split_view).toBe(true);
  });
});
