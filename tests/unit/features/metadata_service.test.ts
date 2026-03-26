import { describe, expect, it } from "vitest";
import { MetadataService } from "$lib/features/metadata/application/metadata_service";
import { MetadataStore } from "$lib/features/metadata/state/metadata_store.svelte";
import type { EditorStore } from "$lib/features/editor";

function create_mock_editor_store(
  note_path: string | null,
  markdown: string = "",
): EditorStore {
  return {
    open_note: note_path
      ? { meta: { path: note_path }, markdown, is_dirty: false }
      : null,
  } as unknown as EditorStore;
}

describe("MetadataService", () => {
  it("extracts frontmatter properties from markdown", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\ntitle: Test\nauthor: Alice\n---\n# Hello",
    );
    const service = new MetadataService(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.properties).toEqual([
      { key: "title", value: "Test", type: "string" },
      { key: "author", value: "Alice", type: "string" },
    ]);
    expect(store.note_path).toBe("notes/test.md");
    expect(store.loading).toBe(false);
  });

  it("extracts frontmatter tags", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\ntags:\n  - svelte\n  - typescript\n---\n# Hello",
    );
    const service = new MetadataService(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.tags).toEqual([
      { tag: "svelte", source: "frontmatter" },
      { tag: "typescript", source: "frontmatter" },
    ]);
  });

  it("extracts inline tags from body text", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "# Hello\n\nSome text with #myTag and #another-tag here.",
    );
    const service = new MetadataService(store, editor_store);

    service.refresh("notes/test.md");

    const tag_names = store.tags.map((t) => t.tag);
    expect(tag_names).toContain("myTag");
    expect(store.tags.every((t) => t.source === "inline")).toBe(true);
  });

  it("clears when note path does not match open note", () => {
    const store = new MetadataStore();
    store.set_metadata(
      "notes/test.md",
      [{ key: "k", value: "v", type: "string" }],
      [],
    );
    const editor_store = create_mock_editor_store("notes/other.md", "# Other");
    const service = new MetadataService(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.note_path).toBeNull();
    expect(store.properties).toEqual([]);
  });

  it("clears when no note is open", () => {
    const store = new MetadataStore();
    store.set_metadata("notes/test.md", [], []);
    const editor_store = create_mock_editor_store(null);
    const service = new MetadataService(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.note_path).toBeNull();
  });

  it("clears store state via clear()", () => {
    const store = new MetadataStore();
    store.set_metadata("notes/test.md", [], []);
    const editor_store = create_mock_editor_store("notes/test.md");
    const service = new MetadataService(store, editor_store);

    service.clear();

    expect(store.note_path).toBeNull();
    expect(store.properties).toEqual([]);
  });

  it("sets error on malformed frontmatter gracefully", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\n: invalid yaml {{\n---\n# Hello",
    );
    const service = new MetadataService(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.loading).toBe(false);
    expect(store.note_path).toBe("notes/test.md");
  });
});
