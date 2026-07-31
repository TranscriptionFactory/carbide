import { describe, it, expect } from "vitest";
import {
  format_wiki_display,
  format_markdown_link,
  split_wiki_target,
  build_wiki_href,
  format_wiki_target_display,
  format_wiki_source,
} from "$lib/features/editor/domain/wiki_link";

describe("format_wiki_display", () => {
  it("strips .md from simple path", () => {
    expect(format_wiki_display("note.md")).toBe("note");
  });

  it("strips .md from nested path", () => {
    expect(format_wiki_display("abc/pqr/note.md")).toBe("abc/pqr/note");
  });

  it("returns path as-is when no .md extension", () => {
    expect(format_wiki_display("abc/pqr/note")).toBe("abc/pqr/note");
  });

  it("does not strip .md from middle of path", () => {
    expect(format_wiki_display("file.md.backup")).toBe("file.md.backup");
  });

  it("handles path that is exactly .md", () => {
    expect(format_wiki_display(".md")).toBe("");
  });

  it("handles empty string", () => {
    expect(format_wiki_display("")).toBe("");
  });

  it("handles path with spaces", () => {
    expect(format_wiki_display("my notes/todo list.md")).toBe(
      "my notes/todo list",
    );
  });

  it("preserves non-.md extensions", () => {
    expect(format_wiki_display("docs/report.pdf")).toBe("docs/report.pdf");
  });
});

describe("split_wiki_target", () => {
  it("splits at the first hash", () => {
    expect(split_wiki_target("note#Head#ing")).toEqual({
      path: "note",
      fragment: "Head#ing",
    });
  });

  it("reports no fragment when the hash is absent", () => {
    expect(split_wiki_target("note")).toEqual({ path: "note", fragment: null });
  });

  it("treats a trailing hash as no fragment", () => {
    expect(split_wiki_target("note#")).toEqual({ path: "note", fragment: null });
  });

  it("allows an empty path for same-note anchors", () => {
    expect(split_wiki_target("#Heading")).toEqual({
      path: "",
      fragment: "Heading",
    });
  });
});

describe("build_wiki_href", () => {
  it("appends .md before the fragment, not after", () => {
    expect(build_wiki_href("note#Heading")).toBe("note.md#Heading");
  });

  it("keeps a block anchor fragment intact", () => {
    expect(build_wiki_href("note#^abc123")).toBe("note.md#^abc123");
  });

  it("leaves an existing .md extension alone", () => {
    expect(build_wiki_href("folder/note.md#Heading")).toBe(
      "folder/note.md#Heading",
    );
  });

  it("does not add an extension to a same-note anchor", () => {
    expect(build_wiki_href("#Heading")).toBe("#Heading");
  });

  it("ignores dots that belong to a folder name", () => {
    expect(build_wiki_href("v1.2/notes")).toBe("v1.2/notes.md");
  });
});

describe("format_wiki_target_display", () => {
  it("joins path and fragment with a chevron", () => {
    expect(format_wiki_target_display("note#Heading")).toBe("note > Heading");
  });

  it("drops the .md extension from the path part", () => {
    expect(format_wiki_target_display("folder/note.md#Heading")).toBe(
      "folder/note > Heading",
    );
  });

  it("shows only the fragment for a same-note anchor", () => {
    expect(format_wiki_target_display("#Heading")).toBe("Heading");
  });

  it("falls back to the plain path when there is no fragment", () => {
    expect(format_wiki_target_display("folder/note.md")).toBe("folder/note");
  });
});

describe("format_wiki_source", () => {
  it("rebuilds a bare wiki link from its href and display", () => {
    expect(format_wiki_source("note.md", "note")).toBe("[[note]]");
  });

  it("rebuilds an anchor link without the .md extension", () => {
    expect(format_wiki_source("note.md#Heading", "note > Heading")).toBe(
      "[[note#Heading]]",
    );
  });

  it("rebuilds a same-note anchor", () => {
    expect(format_wiki_source("#Heading", "Heading")).toBe("[[#Heading]]");
  });

  it("keeps a custom label", () => {
    expect(format_wiki_source("note.md#Heading", "Read this")).toBe(
      "[[note#Heading|Read this]]",
    );
  });
});

describe("format_markdown_link", () => {
  it("formats a simple note path and title", () => {
    expect(format_markdown_link("design.md", "Design")).toBe(
      "[Design](<design.md>)",
    );
  });

  it("formats a nested path", () => {
    expect(
      format_markdown_link("projects/notes/design.md", "Design Document"),
    ).toBe("[Design Document](<projects/notes/design.md>)");
  });

  it("handles paths with spaces", () => {
    expect(format_markdown_link("my notes/todo list.md", "Todo List")).toBe(
      "[Todo List](<my notes/todo list.md>)",
    );
  });

  it("handles empty title", () => {
    expect(format_markdown_link("notes.md", "")).toBe("[](<notes.md>)");
  });

  it("handles deeply nested path", () => {
    expect(format_markdown_link("a/b/c/d/note.md", "Deep Note")).toBe(
      "[Deep Note](<a/b/c/d/note.md>)",
    );
  });

  it("handles title with special characters", () => {
    expect(format_markdown_link("note.md", "Title [with] brackets")).toBe(
      "[Title [with] brackets](<note.md>)",
    );
  });
});
