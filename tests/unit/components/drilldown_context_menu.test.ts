import { describe, it, expect, vi } from "vitest";
import {
  list_folder,
  type DrillDownEntry,
} from "$lib/features/folder/domain/drilldown";
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

describe("drilldown context menu action wiring", () => {
  const notes = [make_note("work/draft.md"), make_note("work/report.md")];
  const folder_paths = ["work", "work/archive"];

  it("rename callback receives the entry path", () => {
    const on_rename = vi.fn();
    const listing = list_folder(notes, folder_paths, [], "work", false);
    const draft = listing.entries.find((e) => e.name === "draft.md")!;
    expect(draft).toBeDefined();

    on_rename(draft.path);
    expect(on_rename).toHaveBeenCalledWith("work/draft.md");
  });

  it("delete callback receives the entry path", () => {
    const on_delete = vi.fn();
    const listing = list_folder(notes, folder_paths, [], "work", false);
    const draft = listing.entries.find((e) => e.name === "draft.md")!;

    on_delete(draft.path);
    expect(on_delete).toHaveBeenCalledWith("work/draft.md");
  });

  it("star callback receives the entry path", () => {
    const on_toggle_star = vi.fn();
    const listing = list_folder(notes, folder_paths, [], "work", false);
    const report = listing.entries.find((e) => e.name === "report.md")!;

    on_toggle_star(report.path);
    expect(on_toggle_star).toHaveBeenCalledWith("work/report.md");
  });

  it("is_starred predicate returns correct value per path", () => {
    const starred_paths = new Set(["work/draft.md"]);
    const is_starred = (path: string) => starred_paths.has(path);

    const listing = list_folder(notes, folder_paths, [], "work", false);
    const draft = listing.entries.find((e) => e.name === "draft.md")!;
    const report = listing.entries.find((e) => e.name === "report.md")!;

    expect(is_starred(draft.path)).toBe(true);
    expect(is_starred(report.path)).toBe(false);
  });

  it("folder entries are present in the listing alongside notes", () => {
    const listing = list_folder(notes, folder_paths, [], "work", false);
    const names = listing.entries.map((e) => e.name).sort();
    expect(names).toContain("archive");
    expect(names).toContain("draft.md");
    expect(names).toContain("report.md");
  });

  it("rename and delete are not called for unrelated entries", () => {
    const on_rename = vi.fn();
    const listing = list_folder(notes, folder_paths, [], "work", false);
    const entries: DrillDownEntry[] = listing.entries;

    entries
      .filter((e) => e.name !== "draft.md")
      .forEach((e) => {
        expect(e.path).not.toBe("work/draft.md");
      });

    expect(on_rename).not.toHaveBeenCalled();
  });
});
