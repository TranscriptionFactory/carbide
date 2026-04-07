import { describe, expect, it } from "vitest";
import { detect_file_type } from "$lib/features/document/domain/document_types";

describe("detect_file_type", () => {
  describe("image types", () => {
    it.each([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"])(
      "maps %s to image",
      (ext) => {
        expect(detect_file_type(`photo${ext}`)).toBe("image");
      },
    );
  });

  describe("pdf type", () => {
    it("maps .pdf to pdf", () => {
      expect(detect_file_type("report.pdf")).toBe("pdf");
    });
  });

  describe("canvas / excalidraw types", () => {
    it("maps .canvas to canvas", () => {
      expect(detect_file_type("board.canvas")).toBe("canvas");
    });

    it("maps .excalidraw to excalidraw", () => {
      expect(detect_file_type("drawing.excalidraw")).toBe("excalidraw");
    });
  });

  describe("text type (text-by-default)", () => {
    it.each([
      ".csv",
      ".tsv",
      ".py",
      ".r",
      ".rs",
      ".ts",
      ".js",
      ".json",
      ".yaml",
      ".yml",
      ".toml",
      ".sh",
      ".bash",
      ".html",
      ".htm",
      ".txt",
      ".log",
      ".ini",
      ".go",
      ".sql",
      ".c",
      ".cpp",
      ".java",
      ".rb",
      ".lua",
      ".swift",
      ".kt",
      ".zig",
      ".unknown_text",
    ])("maps %s to text", (ext) => {
      expect(detect_file_type(`file${ext}`)).toBe("text");
    });
  });

  describe("binary denylist", () => {
    it.each([
      ".docx",
      ".xlsx",
      ".pptx",
      ".zip",
      ".gz",
      ".tar",
      ".7z",
      ".rar",
      ".dmg",
      ".app",
      ".exe",
      ".dll",
      ".so",
      ".dylib",
      ".wasm",
      ".class",
      ".o",
      ".obj",
    ])("returns null for binary extension %s", (ext) => {
      expect(detect_file_type(`file${ext}`)).toBeNull();
    });
  });

  describe("note routing", () => {
    it("returns null for .md files (notes handled separately)", () => {
      expect(detect_file_type("note.md")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("returns null for no extension", () => {
      expect(detect_file_type("Makefile")).toBeNull();
    });

    it("is case-insensitive", () => {
      expect(detect_file_type("Photo.PNG")).toBe("image");
      expect(detect_file_type("script.TS")).toBe("text");
      expect(detect_file_type("archive.ZIP")).toBeNull();
    });

    it("uses the last extension for dotfiles with extensions", () => {
      expect(detect_file_type(".gitignore.json")).toBe("text");
    });
  });
});
