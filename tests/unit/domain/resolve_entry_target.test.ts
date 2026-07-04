import { describe, it, expect } from "vitest";
import { resolve_entry_target } from "$lib/features/folder/domain/drilldown";
import { as_note_path } from "$lib/shared/types/ids";
import type { NoteMeta } from "$lib/shared/types/note";

function make_note(path: string): NoteMeta {
  return {
    id: as_note_path(path) as never,
    path: as_note_path(path),
    name: path.split("/").pop()!.replace(".md", ""),
    title: path.split("/").pop()!.replace(".md", ""),
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: "markdown",
  };
}

describe("resolve_entry_target", () => {
  const notes = [make_note("work/draft.md"), make_note("work/report.md")];
  const folder_paths = ["work", "work/archive"];

  it("resolves a folder path to a folder target", () => {
    const target = resolve_entry_target("work/archive", folder_paths, notes);
    expect(target).toEqual({ kind: "folder", path: "work/archive" });
  });

  it("resolves a note path to a note target with its NoteMeta", () => {
    const target = resolve_entry_target("work/draft.md", folder_paths, notes);
    expect(target).toEqual({ kind: "note", note: notes[0] });
  });

  it("prefers the folder branch when a path is listed as a folder", () => {
    const conflicted = [...notes, make_note("work/archive")];
    const target = resolve_entry_target(
      "work/archive",
      folder_paths,
      conflicted,
    );
    expect(target).toEqual({ kind: "folder", path: "work/archive" });
  });

  it("returns null for paths that are neither folders nor notes", () => {
    const target = resolve_entry_target(
      "work/attachment.png",
      folder_paths,
      notes,
    );
    expect(target).toBeNull();
  });

  it("returns null for an empty path", () => {
    expect(resolve_entry_target("", folder_paths, notes)).toBeNull();
  });
});
