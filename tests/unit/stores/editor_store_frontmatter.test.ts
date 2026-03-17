import { describe, expect, it } from "vitest";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";

describe("EditorStore frontmatter visibility", () => {
  it("defaults to show_frontmatter true", () => {
    const store = new EditorStore();
    expect(store.show_frontmatter).toBe(true);
  });

  it("toggles frontmatter visibility", () => {
    const store = new EditorStore();
    store.toggle_frontmatter_visibility();
    expect(store.show_frontmatter).toBe(false);
    store.toggle_frontmatter_visibility();
    expect(store.show_frontmatter).toBe(true);
  });

  it("sets frontmatter visibility explicitly", () => {
    const store = new EditorStore();
    store.set_frontmatter_visibility(false);
    expect(store.show_frontmatter).toBe(false);
    store.set_frontmatter_visibility(true);
    expect(store.show_frontmatter).toBe(true);
  });

  it("resets show_frontmatter to true on reset()", () => {
    const store = new EditorStore();
    store.set_frontmatter_visibility(false);
    store.reset();
    expect(store.show_frontmatter).toBe(true);
  });
});
