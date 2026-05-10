import { describe, it, expect } from "vitest";
import { resolve_relative_asset_path } from "$lib/features/note";

describe("resolve_relative_asset_path for embed paths", () => {
  it("resolves ./ relative to base note directory", () => {
    expect(
      resolve_relative_asset_path("notes/my-note.md", "./report.pdf"),
    ).toBe("notes/report.pdf");
  });

  it("resolves ../ relative to base note directory", () => {
    expect(
      resolve_relative_asset_path("notes/sub/my-note.md", "../report.pdf"),
    ).toBe("notes/report.pdf");
  });

  it("resolves nested relative paths", () => {
    expect(
      resolve_relative_asset_path("a/b/c/note.md", "../../assets/file.pdf"),
    ).toBe("a/assets/file.pdf");
  });

  it("handles base note at root level with ./", () => {
    expect(resolve_relative_asset_path("note.md", "./file.pdf")).toBe(
      "file.pdf",
    );
  });

  it("handles base note at root level with ../", () => {
    expect(resolve_relative_asset_path("note.md", "../file.pdf")).toBe(
      "file.pdf",
    );
  });
});
