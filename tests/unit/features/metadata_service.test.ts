import { describe, expect, it, vi } from "vitest";
import { MetadataService } from "$lib/features/metadata/application/metadata_service";
import { MetadataStore } from "$lib/features/metadata/state/metadata_store.svelte";
import type { EditorStore, EditorService } from "$lib/features/editor";
import type { MetadataPort } from "$lib/features/metadata/ports";
import { NotesStore } from "$lib/features/note/state/note_store.svelte";
import type { NoteProperty, VaultProperty } from "$lib/features/metadata/types";

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

function create_mock_editor_service(): EditorService {
  return {
    sync_visual_from_markdown_undoable: vi.fn(),
  } as unknown as EditorService;
}

function create_mock_port(properties: VaultProperty[] = []): MetadataPort {
  return {
    get_file_cache: vi.fn().mockRejectedValue("not found"),
    list_properties: vi.fn().mockResolvedValue(properties),
    update_property: vi.fn().mockResolvedValue(undefined),
  };
}

function create_service(
  store: MetadataStore,
  editor_store: EditorStore,
  port: MetadataPort = create_mock_port(),
) {
  return {
    service: new MetadataService(
      store,
      editor_store,
      create_mock_editor_service(),
      port,
      new NotesStore(),
    ),
    port,
  };
}

describe("MetadataService", () => {
  it("extracts frontmatter properties from markdown", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\ntitle: Test\nauthor: Alice\n---\n# Hello",
    );
    const { service } = create_service(store, editor_store);

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
    const { service } = create_service(store, editor_store);

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
    const { service } = create_service(store, editor_store);

    service.refresh("notes/test.md");

    const tag_names = store.tags.map((t) => t.tag);
    expect(tag_names).toContain("myTag");
    expect(store.tags.every((t) => t.source === "inline")).toBe(true);
  });

  it("clears when note path does not match open note", () => {
    const store = new MetadataStore();
    store.set_metadata(
      "notes/test.md",
      [{ key: "k", value: "v", type: "string" } as NoteProperty],
      [],
    );
    const editor_store = create_mock_editor_store("notes/other.md", "# Other");
    const { service } = create_service(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.note_path).toBeNull();
    expect(store.properties).toEqual([]);
  });

  it("clears when no note is open", () => {
    const store = new MetadataStore();
    store.set_metadata("notes/test.md", [], []);
    const editor_store = create_mock_editor_store(null);
    const { service } = create_service(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.note_path).toBeNull();
  });

  it("clears store state via clear()", () => {
    const store = new MetadataStore();
    store.set_metadata("notes/test.md", [], []);
    const editor_store = create_mock_editor_store("notes/test.md");
    const { service } = create_service(store, editor_store);

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
    const { service } = create_service(store, editor_store);

    service.refresh("notes/test.md");

    expect(store.loading).toBe(false);
    expect(store.note_path).toBe("notes/test.md");
  });

  it("persists an added property to the open note and refreshes the store", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\ntitle: Test\n---\n# Hello",
    );
    const { service } = create_service(store, editor_store);

    service.add_property("status", "todo");

    expect(editor_store.open_note?.markdown).toContain("status: todo");
    expect(editor_store.open_note?.is_dirty).toBe(true);
    expect(store.properties).toContainEqual({
      key: "status",
      value: "todo",
      type: "string",
    });
  });

  it("updates an existing property value", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\nstatus: todo\n---\n# Hello",
    );
    const { service } = create_service(store, editor_store);

    service.update_property("status", "done");

    expect(editor_store.open_note?.markdown).toContain("status: done");
    expect(store.properties).toContainEqual({
      key: "status",
      value: "done",
      type: "string",
    });
  });

  it("removes a property from the open note", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\ntitle: Test\nstatus: todo\n---\n# Hello",
    );
    const { service } = create_service(store, editor_store);

    service.remove_property("status");

    expect(editor_store.open_note?.markdown).not.toContain("status");
    expect(store.properties.map((p) => p.key)).not.toContain("status");
  });

  it("writes array-typed standard fields as YAML lists", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\ntitle: Test\n---\n# Hello",
    );
    const { service } = create_service(store, editor_store);

    service.add_property("aliases", "foo, bar");

    expect(editor_store.open_note?.markdown).toContain("aliases: [foo, bar]");
  });

  it("keeps a non-standard list property as a YAML list when edited", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(
      "notes/test.md",
      "---\nkeywords: [Variables, Functions]\n---\n# Hello",
    );
    const { service } = create_service(store, editor_store);

    service.refresh("notes/test.md");
    service.update_property("keywords", "Variables, Functions, Loops");

    expect(editor_store.open_note?.markdown).toContain(
      "keywords: [Variables, Functions, Loops]",
    );
    expect(store.properties).toContainEqual({
      key: "keywords",
      value: ["Variables", "Functions", "Loops"],
      type: "tags",
    });
  });

  it("does nothing when there is no open note", () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store(null);
    const { service } = create_service(store, editor_store);

    expect(() => service.add_property("status", "todo")).not.toThrow();
    expect(store.properties).toEqual([]);
  });

  it("loads the vault property registry into the store", async () => {
    const store = new MetadataStore();
    const editor_store = create_mock_editor_store("notes/test.md");
    const registry: VaultProperty[] = [
      {
        name: "status",
        property_type: "string",
        count: 3,
        unique_values: ["todo"],
      },
    ];
    const { service, port } = create_service(
      store,
      editor_store,
      create_mock_port(registry),
    );

    await service.load_suggestions("vault-1");

    expect(port.list_properties).toHaveBeenCalledWith("vault-1");
    expect(store.property_registry).toEqual(registry);
  });
});
