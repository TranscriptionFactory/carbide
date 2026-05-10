import { describe, it, expect } from "vitest";
import { resolve_embed_path } from "$lib/app/di/create_app_context";

describe("resolve_embed_path", () => {
  it("returns absolute vault-relative paths unchanged", () => {
    expect(resolve_embed_path("notes/my-note.md", "assets/report.pdf")).toBe(
      "assets/report.pdf",
    );
  });

  it("returns simple filenames unchanged", () => {
    expect(resolve_embed_path("notes/my-note.md", "image.png")).toBe(
      "image.png",
    );
  });

  it("resolves ./ relative to base note directory", () => {
    expect(resolve_embed_path("notes/my-note.md", "./report.pdf")).toBe(
      "notes/report.pdf",
    );
  });

  it("resolves ../ relative to base note directory", () => {
    expect(resolve_embed_path("notes/sub/my-note.md", "../report.pdf")).toBe(
      "notes/report.pdf",
    );
  });

  it("resolves nested relative paths", () => {
    expect(
      resolve_embed_path("a/b/c/note.md", "../../assets/file.pdf"),
    ).toBe("a/assets/file.pdf");
  });

  it("handles base note at root level with ./", () => {
    expect(resolve_embed_path("note.md", "./file.pdf")).toBe("file.pdf");
  });

  it("handles base note at root level with ../", () => {
    expect(resolve_embed_path("note.md", "../file.pdf")).toBe("file.pdf");
  });
});
