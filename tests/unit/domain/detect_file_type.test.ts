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

  describe("csv type", () => {
    it("maps .csv to csv", () => {
      expect(detect_file_type("data.csv")).toBe("csv");
    });

    it("maps .tsv to csv", () => {
      expect(detect_file_type("data.tsv")).toBe("csv");
    });
  });

  describe("code type", () => {
    it.each([
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
    ])("maps %s to code", (ext) => {
      expect(detect_file_type(`script${ext}`)).toBe("code");
    });
  });

  describe("text type", () => {
    it("maps .txt to text", () => {
      expect(detect_file_type("readme.txt")).toBe("text");
    });

    it("maps .log to text", () => {
      expect(detect_file_type("app.log")).toBe("text");
    });

    it("maps .ini to text", () => {
      expect(detect_file_type("config.ini")).toBe("text");
    });
  });

  describe("unknown / edge cases", () => {
    it("returns text for unknown extension", () => {
      expect(detect_file_type("file.xyz")).toBe("text");
    });

    it("returns null for no extension", () => {
      expect(detect_file_type("Makefile")).toBeNull();
    });

    it("is case-insensitive", () => {
      expect(detect_file_type("Photo.PNG")).toBe("image");
      expect(detect_file_type("script.TS")).toBe("code");
    });

    it("uses the last extension for dotfiles with extensions", () => {
      expect(detect_file_type(".gitignore.json")).toBe("code");
    });
  });
});
