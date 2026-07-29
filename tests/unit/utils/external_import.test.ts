import { describe, expect, it } from "vitest";
import {
  classify_external_files,
  format_external_import_summary,
  is_external_file_drag,
  is_markdown_filename,
  resolve_external_drop_folder,
  uniquify_note_path,
} from "$lib/features/folder/domain/external_import";

describe("is_markdown_filename", () => {
  it("accepts .md and .markdown regardless of case", () => {
    expect(is_markdown_filename("notes.md")).toBe(true);
    expect(is_markdown_filename("notes.MD")).toBe(true);
    expect(is_markdown_filename("notes.markdown")).toBe(true);
  });

  it("rejects other extensions and extensionless names", () => {
    expect(is_markdown_filename("photo.png")).toBe(false);
    expect(is_markdown_filename("archive.md.zip")).toBe(false);
    expect(is_markdown_filename("README")).toBe(false);
    expect(is_markdown_filename(".md")).toBe(false);
  });
});

describe("classify_external_files", () => {
  it("splits markdown files from asset files preserving order", () => {
    const files = [
      { name: "a.md" },
      { name: "b.png" },
      { name: "c.markdown" },
      { name: "d.pdf" },
    ];

    const { markdown_files, asset_files } = classify_external_files(files);

    expect(markdown_files.map((f) => f.name)).toEqual(["a.md", "c.markdown"]);
    expect(asset_files.map((f) => f.name)).toEqual(["b.png", "d.pdf"]);
  });

  it("returns empty groups for empty input", () => {
    const { markdown_files, asset_files } = classify_external_files([]);

    expect(markdown_files).toEqual([]);
    expect(asset_files).toEqual([]);
  });
});

describe("is_external_file_drag", () => {
  it("accepts a drag carrying OS files", () => {
    expect(is_external_file_drag(["Files"])).toBe(true);
    expect(is_external_file_drag(["text/plain", "Files"])).toBe(true);
  });

  it("rejects internal drags and absent data transfers", () => {
    expect(
      is_external_file_drag([
        "text/plain",
        "application/x-carbide-filetree-count",
      ]),
    ).toBe(false);
    expect(is_external_file_drag([])).toBe(false);
    expect(is_external_file_drag(undefined)).toBe(false);
  });
});

describe("resolve_external_drop_folder", () => {
  it("targets the folder when dropping on a folder node", () => {
    expect(
      resolve_external_drop_folder({ is_folder: true, path: "projects/docs" }),
    ).toBe("projects/docs");
  });

  it("targets the containing folder when dropping on a file node", () => {
    expect(
      resolve_external_drop_folder({ is_folder: false, path: "a/note.md" }),
    ).toBe("a");
    expect(
      resolve_external_drop_folder({
        is_folder: false,
        path: "projects/docs/spec.pdf",
      }),
    ).toBe("projects/docs");
  });

  it("targets the vault root for root-level files and empty space", () => {
    expect(
      resolve_external_drop_folder({ is_folder: false, path: "note.md" }),
    ).toBe("");
    expect(resolve_external_drop_folder(null)).toBe("");
  });
});

describe("format_external_import_summary", () => {
  it("pluralizes the imported count", () => {
    expect(format_external_import_summary({ imported: 1, skipped: 0 })).toBe(
      "Imported 1 file",
    );
    expect(format_external_import_summary({ imported: 3, skipped: 0 })).toBe(
      "Imported 3 files",
    );
  });

  it("appends the skipped count only when something was skipped", () => {
    expect(format_external_import_summary({ imported: 2, skipped: 1 })).toBe(
      "Imported 2 files, skipped 1",
    );
    expect(format_external_import_summary({ imported: 0, skipped: 4 })).toBe(
      "Imported 0 files, skipped 4",
    );
  });
});

describe("uniquify_note_path", () => {
  it("keeps the name when free", () => {
    expect(uniquify_note_path("docs", "todo.md", ["docs/other.md"])).toBe(
      "docs/todo.md",
    );
  });

  it("builds a root path when target folder is empty", () => {
    expect(uniquify_note_path("", "todo.md", [])).toBe("todo.md");
  });

  it("appends a numeric suffix on collision, case-insensitively", () => {
    expect(uniquify_note_path("docs", "todo.md", ["Docs/Todo.md"])).toBe(
      "docs/todo-2.md",
    );
  });

  it("skips already-taken suffixes", () => {
    expect(
      uniquify_note_path("", "todo.md", ["todo.md", "todo-2.md", "todo-3.md"]),
    ).toBe("todo-4.md");
  });
});
