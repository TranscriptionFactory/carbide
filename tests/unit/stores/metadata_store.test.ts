import { describe, expect, it } from "vitest";
import { MetadataStore } from "$lib/features/metadata/state/metadata_store.svelte";
import type { NoteProperty } from "$lib/features/metadata/types";

describe("MetadataStore", () => {
  it("starts with empty state", () => {
    const store = new MetadataStore();
    expect(store.properties).toEqual([]);
    expect(store.tags).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.note_path).toBeNull();
  });

  it("sets metadata for a note", () => {
    const store = new MetadataStore();
    const properties: NoteProperty[] = [
      { key: "title", value: "Test", type: "string" },
    ];
    const tags = [{ tag: "svelte", source: "frontmatter" as const }];

    store.set_metadata("notes/test.md", properties, tags);

    expect(store.note_path).toBe("notes/test.md");
    expect(store.properties).toEqual(properties);
    expect(store.tags).toEqual(tags);
    expect(store.error).toBeNull();
  });

  it("clears error when setting metadata", () => {
    const store = new MetadataStore();
    store.set_error("some error");
    store.set_metadata("notes/test.md", [], []);
    expect(store.error).toBeNull();
  });

  it("tracks loading state", () => {
    const store = new MetadataStore();
    store.set_loading(true);
    expect(store.loading).toBe(true);
    store.set_loading(false);
    expect(store.loading).toBe(false);
  });

  it("clears all state", () => {
    const store = new MetadataStore();
    store.set_metadata(
      "notes/test.md",
      [{ key: "k", value: "v", type: "string" } as NoteProperty],
      [{ tag: "t", source: "inline" as const }],
    );
    store.set_loading(true);
    store.set_error("err");

    store.clear();

    expect(store.properties).toEqual([]);
    expect(store.tags).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.note_path).toBeNull();
  });
});
