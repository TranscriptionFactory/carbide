import { describe, it, expect } from "vitest";
import { serialize_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import { schema } from "$lib/features/editor/adapters/schema";

const NOTE_EMBED_REGEX = /^!\[\[([^\]#\n]+?)(?:#([^\]]*))?\]\]$/;

function expect_defined<T>(value: T | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function note_embed_type() {
  return expect_defined(schema.nodes["note_embed"], "note_embed node type");
}

describe("NOTE_EMBED_REGEX", () => {
  it("matches simple note embed", () => {
    const match = NOTE_EMBED_REGEX.exec("![[My Note]]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("My Note");
    expect(match![2]).toBeUndefined();
  });

  it("matches note embed with heading fragment", () => {
    const match = NOTE_EMBED_REGEX.exec("![[My Note#Introduction]]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("My Note");
    expect(match![2]).toBe("Introduction");
  });

  it("matches note embed with block ref", () => {
    const match = NOTE_EMBED_REGEX.exec("![[My Note#^abc123]]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("My Note");
    expect(match![2]).toBe("^abc123");
  });

  it("matches note embed with .md extension", () => {
    const match = NOTE_EMBED_REGEX.exec("![[folder/note.md]]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("folder/note.md");
  });

  it("matches extensionless note embed", () => {
    const match = NOTE_EMBED_REGEX.exec("![[daily/2024-01-01]]");
    expect(match).not.toBeNull();
    expect(match![1]).toBe("daily/2024-01-01");
  });

  it("does not match non-embed wiki links", () => {
    expect(NOTE_EMBED_REGEX.test("[[My Note]]")).toBe(false);
  });

  it("does not match multiline", () => {
    expect(NOTE_EMBED_REGEX.test("![[My\nNote]]")).toBe(false);
  });
});

describe("note_embed schema", () => {
  it("note_embed node exists in schema", () => {
    expect(schema.nodes["note_embed"]).toBeTruthy();
  });

  it("creates a note_embed node with default attrs", () => {
    const node = note_embed_type().create({ src: "test.md" });
    expect(node.type.name).toBe("note_embed");
    expect(node.attrs["src"]).toBe("test.md");
    expect(node.attrs["fragment"]).toBeNull();
    expect(node.attrs["display_src"]).toBe("");
  });

  it("creates a note_embed node with all attrs", () => {
    const node = note_embed_type().create({
      src: "folder/note.md",
      fragment: "Introduction",
      display_src: "note#Introduction",
    });
    expect(node.attrs["src"]).toBe("folder/note.md");
    expect(node.attrs["fragment"]).toBe("Introduction");
    expect(node.attrs["display_src"]).toBe("note#Introduction");
  });

  it("creates a note_embed node with block ref fragment", () => {
    const node = note_embed_type().create({
      src: "note.md",
      fragment: "^abc123",
      display_src: "note#^abc123",
    });
    expect(node.attrs["fragment"]).toBe("^abc123");
  });
});

describe("note_embed serialization", () => {
  it("serializes note_embed with display_src", () => {
    const doc = schema.node("doc", null, [
      note_embed_type().create({
        src: "note.md",
        display_src: "note",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[note]]");
  });

  it("serializes note_embed with heading fragment", () => {
    const doc = schema.node("doc", null, [
      note_embed_type().create({
        src: "folder/note.md",
        fragment: "Heading",
        display_src: "folder/note#Heading",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[folder/note#Heading]]");
  });

  it("serializes note_embed with block ref", () => {
    const doc = schema.node("doc", null, [
      note_embed_type().create({
        src: "note.md",
        fragment: "^abc123",
        display_src: "note#^abc123",
      }),
    ]);
    const md = serialize_markdown(doc);
    expect(md.trim()).toBe("![[note#^abc123]]");
  });
});
