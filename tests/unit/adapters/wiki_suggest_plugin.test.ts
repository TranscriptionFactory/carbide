import { describe, it, expect } from "vitest";
import { extract_wiki_query } from "$lib/features/editor/adapters/wiki_suggest_plugin";

describe("extract_wiki_query", () => {
  describe("note mode", () => {
    it("extracts basic wiki query", () => {
      const result = extract_wiki_query("some text [[note");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("note");
      expect(result!.query).toBe("note");
      expect(result!.is_embed).toBe(false);
    });

    it("returns null when no [[ found", () => {
      expect(extract_wiki_query("some text")).toBeNull();
    });

    it("returns null when ]] closes the link", () => {
      expect(extract_wiki_query("text [[done]] more")).toBeNull();
    });

    it("returns null when pipe in query", () => {
      expect(extract_wiki_query("text [[note|alias")).toBeNull();
    });
  });

  describe("embed prefix (![[)", () => {
    it("detects embed prefix", () => {
      const result = extract_wiki_query("text ![[note");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("note");
      expect(result!.is_embed).toBe(true);
    });

    it("offset includes the ! character", () => {
      const result = extract_wiki_query("text ![[note");
      expect(result).not.toBeNull();
      expect(result!.offset).toBe(5);
    });

    it("non-embed offset starts at [[", () => {
      const result = extract_wiki_query("text [[note");
      expect(result).not.toBeNull();
      expect(result!.offset).toBe(5);
      expect(result!.is_embed).toBe(false);
    });
  });

  describe("heading mode", () => {
    it("extracts heading query", () => {
      const result = extract_wiki_query("text [[note#heading");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("heading");
      if (result!.mode === "heading") {
        expect(result!.note_name).toBe("note");
        expect(result!.heading_query).toBe("heading");
      }
    });

    it("handles self-reference heading", () => {
      const result = extract_wiki_query("text [[#heading");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("heading");
      if (result!.mode === "heading") {
        expect(result!.note_name).toBeNull();
        expect(result!.heading_query).toBe("heading");
      }
    });

    it("detects embed heading", () => {
      const result = extract_wiki_query("text ![[note#heading");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("heading");
      expect(result!.is_embed).toBe(true);
    });
  });

  describe("block mode", () => {
    it("extracts block query", () => {
      const result = extract_wiki_query("text [[note#^abc");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("block");
      if (result!.mode === "block") {
        expect(result!.note_name).toBe("note");
        expect(result!.block_query).toBe("abc");
      }
    });

    it("handles empty block query", () => {
      const result = extract_wiki_query("text [[note#^");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("block");
      if (result!.mode === "block") {
        expect(result!.block_query).toBe("");
      }
    });

    it("handles self-reference block", () => {
      const result = extract_wiki_query("text [[#^block-id");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("block");
      if (result!.mode === "block") {
        expect(result!.note_name).toBeNull();
        expect(result!.block_query).toBe("block-id");
      }
    });

    it("detects embed block", () => {
      const result = extract_wiki_query("text ![[note#^block");
      expect(result).not.toBeNull();
      expect(result!.mode).toBe("block");
      expect(result!.is_embed).toBe(true);
    });
  });
});
