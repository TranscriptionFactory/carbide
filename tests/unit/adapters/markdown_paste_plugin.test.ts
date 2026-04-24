import { describe, it, expect } from "vitest";
import { Slice } from "prosemirror-model";
import { create_markdown_paste_prose_plugin } from "$lib/features/editor/adapters/markdown_paste_plugin";
import { schema } from "$lib/features/editor/adapters/schema";

function make_parse_fn(md: string) {
  const para = schema.nodes.paragraph.create(
    null,
    md.length > 0 ? schema.text(md) : [],
  );
  return { content: schema.nodes.doc.create(null, [para]).content };
}

describe("create_markdown_paste_prose_plugin", () => {
  describe("clipboardTextParser", () => {
    it("parses plain text through parse_fn", () => {
      const plugin = create_markdown_paste_prose_plugin(make_parse_fn);
      const parser = plugin.props.clipboardTextParser;
      expect(parser).toBeDefined();

      const result = (parser as Function)("hello world", null, true, {});
      expect(result).toBeInstanceOf(Slice);
      expect(result.content.childCount).toBeGreaterThan(0);
    });

    it("returns empty slice for whitespace-only text", () => {
      const plugin = create_markdown_paste_prose_plugin(make_parse_fn);
      const parser = plugin.props.clipboardTextParser;

      const result = (parser as Function)("   ", null, true, {});
      expect(result).toEqual(Slice.empty);
    });

    it("returns empty slice when no view provided", () => {
      const plugin = create_markdown_paste_prose_plugin(make_parse_fn);
      const parser = plugin.props.clipboardTextParser;

      const result = (parser as Function)("hello", null, true, null);
      expect(result).toEqual(Slice.empty);
    });

    it("returns empty slice when parse_fn throws", () => {
      const throwing_parse = () => {
        throw new Error("parse error");
      };
      const plugin = create_markdown_paste_prose_plugin(throwing_parse);
      const parser = plugin.props.clipboardTextParser;

      const result = (parser as Function)("hello", null, true, {});
      expect(result).toEqual(Slice.empty);
    });
  });
});
