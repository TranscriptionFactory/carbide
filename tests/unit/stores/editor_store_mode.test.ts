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

  it("toggle_editor_mode cycles source to read_only", () => {
    const store = new EditorStore();
    store.toggle_editor_mode();
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("read_only");
  });

  it("toggle_editor_mode cycles read_only to visual", () => {
    const store = new EditorStore();
    store.toggle_editor_mode();
    store.toggle_editor_mode();
    store.toggle_editor_mode();
    expect(store.editor_mode).toBe("visual");
  });

  it("toggle_editor_mode cycles split to visual", () => {
    const store = new EditorStore();
    store.set_editor_mode("split");
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
    store.reset();
    expect(store.editor_mode).toBe("visual");
    expect(store.cursor_offset).toBe(0);
    expect(store.scroll_fraction).toBe(0);
  });
});
