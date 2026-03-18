import { describe, it, expect } from "vitest";

const EXCALIDRAW_EMBED_REGEX = /^!\[\[([^\]\n]+\.(?:excalidraw|canvas))\]\]$/;

describe("excalidraw embed regex", () => {
  it("matches excalidraw files", () => {
    expect(EXCALIDRAW_EMBED_REGEX.test("![[file.excalidraw]]")).toBe(true);
  });

  it("matches canvas files", () => {
    expect(EXCALIDRAW_EMBED_REGEX.test("![[file.canvas]]")).toBe(true);
  });

  it("matches nested path excalidraw files", () => {
    const match = EXCALIDRAW_EMBED_REGEX.exec("![[path/to/file.excalidraw]]");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("path/to/file.excalidraw");
  });

  it("matches nested path canvas files", () => {
    const match = EXCALIDRAW_EMBED_REGEX.exec("![[path/to/file.canvas]]");
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("path/to/file.canvas");
  });

  it("captures the path correctly", () => {
    const match = EXCALIDRAW_EMBED_REGEX.exec("![[file.excalidraw]]");
    expect(match?.[1]).toBe("file.excalidraw");
  });

  it("does not match without exclamation mark", () => {
    expect(EXCALIDRAW_EMBED_REGEX.test("[[file.excalidraw]]")).toBe(false);
  });

  it("does not match wrong extension", () => {
    expect(EXCALIDRAW_EMBED_REGEX.test("![[file.md]]")).toBe(false);
  });

  it("does not match plain markdown image syntax", () => {
    expect(EXCALIDRAW_EMBED_REGEX.test("![alt](file.excalidraw)")).toBe(false);
  });

  it("does not match with surrounding text", () => {
    expect(EXCALIDRAW_EMBED_REGEX.test("some text ![[file.excalidraw]]")).toBe(
      false,
    );
  });
});
