import { describe, it, expect } from "vitest";
import { TagStore } from "$lib/features/tags/state/tag_store.svelte";
import type { TagInfo } from "$lib/features/tags/types";

function make_tag(tag: string, count: number): TagInfo {
  return { tag, count };
}

describe("TagStore", () => {
  it("has correct initial state", () => {
    const store = new TagStore();

    expect(store.tags).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.selected_tag).toBeNull();
    expect(store.notes_for_tag).toEqual([]);
    expect(store.notes_loading).toBe(false);
    expect(store.search_query).toBe("");
  });

  it("set_tags updates tags array", () => {
    const store = new TagStore();
    const tags = [make_tag("rust", 5), make_tag("svelte", 3)];

    store.set_tags(tags);

    expect(store.tags).toEqual(tags);
  });

  it("set_loading updates loading state", () => {
    const store = new TagStore();

    store.set_loading(true);

    expect(store.loading).toBe(true);
  });

  it("set_error updates error state", () => {
    const store = new TagStore();

    store.set_error("something failed");

    expect(store.error).toBe("something failed");
  });

  it("set_error null clears error", () => {
    const store = new TagStore();
    store.set_error("previous");

    store.set_error(null);

    expect(store.error).toBeNull();
  });

  it("select_tag sets selected_tag", () => {
    const store = new TagStore();

    store.select_tag("rust");

    expect(store.selected_tag).toBe("rust");
  });

  it("select_tag null deselects", () => {
    const store = new TagStore();
    store.select_tag("rust");

    store.select_tag(null);

    expect(store.selected_tag).toBeNull();
  });

  it("set_notes_for_tag updates notes_for_tag", () => {
    const store = new TagStore();

    store.set_notes_for_tag(["notes/a.md", "notes/b.md"]);

    expect(store.notes_for_tag).toEqual(["notes/a.md", "notes/b.md"]);
  });

  it("set_notes_loading updates notes_loading", () => {
    const store = new TagStore();

    store.set_notes_loading(true);

    expect(store.notes_loading).toBe(true);
  });

  it("set_search_query updates search_query", () => {
    const store = new TagStore();

    store.set_search_query("svel");

    expect(store.search_query).toBe("svel");
  });

  it("filtered_tags returns all tags when search_query is empty", () => {
    const store = new TagStore();
    store.set_tags([make_tag("rust", 5), make_tag("svelte", 3)]);

    expect(store.filtered_tags).toHaveLength(2);
  });

  it("filtered_tags filters by search_query case-insensitively", () => {
    const store = new TagStore();
    store.set_tags([
      make_tag("rust", 5),
      make_tag("svelte", 3),
      make_tag("RUST-async", 1),
    ]);

    store.set_search_query("RUST");

    expect(store.filtered_tags).toHaveLength(2);
    expect(store.filtered_tags.map((t) => t.tag)).toContain("rust");
    expect(store.filtered_tags.map((t) => t.tag)).toContain("RUST-async");
  });

  it("filtered_tags returns empty when no match", () => {
    const store = new TagStore();
    store.set_tags([make_tag("rust", 5), make_tag("svelte", 3)]);

    store.set_search_query("python");

    expect(store.filtered_tags).toHaveLength(0);
  });

  it("reset restores all state to defaults", () => {
    const store = new TagStore();
    store.set_tags([make_tag("rust", 5)]);
    store.set_loading(true);
    store.set_error("err");
    store.select_tag("rust");
    store.set_notes_for_tag(["notes/a.md"]);
    store.set_notes_loading(true);
    store.set_search_query("ru");

    store.reset();

    expect(store.tags).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.selected_tag).toBeNull();
    expect(store.notes_for_tag).toEqual([]);
    expect(store.notes_loading).toBe(false);
    expect(store.search_query).toBe("");
  });
});
