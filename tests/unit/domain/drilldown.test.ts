import { describe, it, expect } from "vitest";
import {
  list_folder,
  parent_path_of,
} from "$lib/features/folder/domain/drilldown";
import type { NoteMeta } from "$lib/shared/types/note";
import { as_note_path } from "$lib/shared/types/ids";

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

describe("parent_path_of", () => {
  it("returns null for the empty root", () => {
    expect(parent_path_of("")).toBeNull();
  });

  it("returns vault root for top-level entries", () => {
    expect(parent_path_of("notes")).toBe("");
    expect(parent_path_of("foo.md")).toBe("");
  });

  it("returns the immediate parent for nested entries", () => {
    expect(parent_path_of("a/b")).toBe("a");
    expect(parent_path_of("a/b/c.md")).toBe("a/b");
  });
});

describe("list_folder", () => {
  const notes = [
    make_note("a.md"),
    make_note("work/draft.md"),
    make_note("work/release/notes.md"),
    make_note("work/release/2026.md"),
  ];
  const folder_paths = ["work", "work/release", "personal"];

  it("lists root entries when current_path is empty", () => {
    const listing = list_folder(notes, folder_paths, [], "", false);
    expect(listing.parent_path).toBeNull();
    const names = listing.entries.map((e) => e.name).sort();
    expect(names).toEqual(["a.md", "personal", "work"]);
  });

  it("lists entries inside a sub-folder", () => {
    const listing = list_folder(notes, folder_paths, [], "work", false);
    expect(listing.parent_path).toBe("");
    const names = listing.entries.map((e) => e.name).sort();
    expect(names).toEqual(["draft.md", "release"]);
  });

  it("descends into nested folder paths", () => {
    const listing = list_folder(notes, folder_paths, [], "work/release", false);
    expect(listing.parent_path).toBe("work");
    const names = listing.entries.map((e) => e.name).sort();
    expect(names).toEqual(["2026.md", "notes.md"]);
  });

  it("returns an empty entries list when the folder does not exist", () => {
    const listing = list_folder(notes, folder_paths, [], "missing", false);
    expect(listing.entries).toEqual([]);
    expect(listing.parent_path).toBe("");
  });

  it("hides dotfiles unless show_hidden_files is true", () => {
    const with_hidden = [...notes, make_note(".secret.md")];
    const folders = [...folder_paths, ".carbide"];

    const hidden = list_folder(with_hidden, folders, [], "", false);
    expect(hidden.entries.map((e) => e.name)).not.toContain(".secret.md");
    expect(hidden.entries.map((e) => e.name)).not.toContain(".carbide");

    const visible = list_folder(with_hidden, folders, [], "", true);
    expect(visible.entries.map((e) => e.name)).toContain(".secret.md");
  });

  it("marks folder vs file entries correctly", () => {
    const listing = list_folder(notes, folder_paths, [], "work", false);
    const release = listing.entries.find((e) => e.name === "release")!;
    const draft = listing.entries.find((e) => e.name === "draft.md")!;
    expect(release.is_folder).toBe(true);
    expect(release.note).toBeNull();
    expect(draft.is_folder).toBe(false);
    expect(draft.note?.path).toBe("work/draft.md");
  });
});
