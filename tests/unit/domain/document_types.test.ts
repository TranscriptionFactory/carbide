import { describe, expect, it } from "vitest";
import { detect_file_type } from "$lib/features/document/domain/document_types";

describe("detect_file_type", () => {
  it("detects pdf", () => {
    expect(detect_file_type("file.pdf")).toBe("pdf");
  });

  it("detects image case-insensitively", () => {
    expect(detect_file_type("image.PNG")).toBe("image");
  });

  it("detects text for csv (collapsed type)", () => {
    expect(detect_file_type("data.csv")).toBe("text");
  });

  it("detects text for code files (collapsed type)", () => {
    expect(detect_file_type("main.rs")).toBe("text");
  });

  it("detects text", () => {
    expect(detect_file_type("readme.txt")).toBe("text");
  });

  it("returns text for unknown text extensions", () => {
    expect(detect_file_type("unknown.xyz")).toBe("text");
  });

  it("returns null for markdown files", () => {
    expect(detect_file_type("note.md")).toBeNull();
  });

  it("returns null for files with no extension", () => {
    expect(detect_file_type("noext")).toBeNull();
  });

  it("returns null for binary denylist extensions", () => {
    expect(detect_file_type("doc.docx")).toBeNull();
    expect(detect_file_type("archive.zip")).toBeNull();
  });
});
