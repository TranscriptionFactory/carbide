import { describe, it, expect } from "vitest";
import {
  file_icon_component,
  file_icon_for_path,
} from "$lib/shared/ui/file_icons";

describe("file_icon_component", () => {
  it("gives a pdf its own icon rather than the plain-text one", () => {
    expect(file_icon_component("pdf")).not.toBe(file_icon_component("txt"));
  });

  it("distinguishes every document kind recents can surface", () => {
    const kinds = ["md", "canvas", "pdf", "epub", "png", "ts", "csv"];
    const icons = kinds.map((ext) => file_icon_component(ext));

    expect(new Set(icons).size).toBe(kinds.length);
  });

  it("ignores extension casing", () => {
    expect(file_icon_component("PDF")).toBe(file_icon_component("pdf"));
    expect(file_icon_component("Canvas")).toBe(file_icon_component("canvas"));
  });

  it("falls back to a generic icon for an unknown extension", () => {
    expect(file_icon_component("qqq")).toBe(file_icon_component(""));
  });

  it("treats markdown as text", () => {
    expect(file_icon_component("md")).toBe(file_icon_component("txt"));
    expect(file_icon_component("markdown")).toBe(file_icon_component("md"));
  });
});

describe("file_icon_for_path", () => {
  it("reads the extension off a nested path", () => {
    expect(file_icon_for_path("refs/papers/study.pdf")).toBe(
      file_icon_component("pdf"),
    );
  });

  it("matches the tree icon for the same file", () => {
    expect(file_icon_for_path("notes/todo.md")).toBe(file_icon_component("md"));
    expect(file_icon_for_path("boards/plan.canvas")).toBe(
      file_icon_component("canvas"),
    );
  });

  it("does not mistake a dot in a directory name for an extension", () => {
    expect(file_icon_for_path("v1.2/README")).toBe(file_icon_component(""));
  });

  it("treats a dotfile as having no extension", () => {
    expect(file_icon_for_path(".gitignore")).toBe(file_icon_component(""));
  });
});
