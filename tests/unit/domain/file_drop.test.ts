import { describe, it, expect } from "vitest";
import { build_file_link } from "$lib/features/editor/domain/file_drop_plugin";

describe("build_file_link", () => {
  describe("non-image files", () => {
    it("builds a markdown link with filename as label", () => {
      const result = build_file_link("docs/report.pdf", "notes/my-note.md");
      expect(result).toBe("[report.pdf](../docs/report.pdf)");
    });

    it("builds a markdown link for a file in the same folder", () => {
      const result = build_file_link("notes/data.csv", "notes/my-note.md");
      expect(result).toBe("[data.csv](data.csv)");
    });

    it("builds a link for a nested file path", () => {
      const result = build_file_link(
        "attachments/2024/slides.pptx",
        "notes/my-note.md",
      );
      expect(result).toBe("[slides.pptx](../attachments/2024/slides.pptx)");
    });

    it("builds a link for a file at root level", () => {
      const result = build_file_link("README.txt", "notes/my-note.md");
      expect(result).toBe("[README.txt](../README.txt)");
    });
  });

  describe("image files", () => {
    it("builds an image link for .png files", () => {
      const result = build_file_link("assets/photo.png", "notes/my-note.md");
      expect(result).toBe("![photo](../assets/photo.png)");
    });

    it("builds an image link for .jpg files", () => {
      const result = build_file_link("images/banner.jpg", "notes/my-note.md");
      expect(result).toBe("![banner](../images/banner.jpg)");
    });

    it("builds an image link for .gif files", () => {
      const result = build_file_link("assets/anim.gif", "notes/my-note.md");
      expect(result).toBe("![anim](../assets/anim.gif)");
    });

    it("builds an image link for .svg files", () => {
      const result = build_file_link("icons/logo.svg", "notes/my-note.md");
      expect(result).toBe("![logo](../icons/logo.svg)");
    });

    it("builds an image link for .webp files", () => {
      const result = build_file_link("media/cover.webp", "notes/my-note.md");
      expect(result).toBe("![cover](../media/cover.webp)");
    });

    it("builds an image link for .jpeg files", () => {
      const result = build_file_link("photos/shot.jpeg", "notes/my-note.md");
      expect(result).toBe("![shot](../photos/shot.jpeg)");
    });

    it("uses filename sans extension as alt text for images", () => {
      const result = build_file_link(
        "assets/my-diagram.png",
        "notes/my-note.md",
      );
      expect(result).toBe("![my-diagram](../assets/my-diagram.png)");
    });
  });

  describe("path handling", () => {
    it("handles note at root with file at root", () => {
      const result = build_file_link("file.pdf", "note.md");
      expect(result).toBe("[file.pdf](file.pdf)");
    });

    it("handles deeply nested note", () => {
      const result = build_file_link("assets/photo.png", "a/b/c/note.md");
      expect(result).toBe("![photo](../../../assets/photo.png)");
    });

    it("uses full filename (with extension) as label for non-images", () => {
      const result = build_file_link("data/analysis.py", "notes/note.md");
      expect(result).toBe("[analysis.py](../data/analysis.py)");
    });
  });
});
