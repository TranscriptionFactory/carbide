import { describe, expect, it } from "vitest";
import {
  build_offset_index,
  md_offset_from_line_character_indexed,
  md_offset_to_prose_pos,
  md_offset_to_prose_pos_indexed,
  prose_cursor_to_md_offset,
} from "$lib/features/editor/adapters/cursor_offset_mapper";
import { md_offset_from_line_character } from "$lib/features/editor/adapters/lsp_plugin_utils";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";

const FIXTURES = [
  "hello world\n",
  "# Title\n\nBody with **bold**, *italic* and `inline code`.\n\nTail paragraph.\n",
  "---\ntitle: Test\ntags: [a, b]\n---\n\n# Heading\n\nText after frontmatter.\n",
  "A [link](https://example.com) and a [[wiki link]] here.\n",
  "| a | b |\n| - | - |\n| 1 | 2 |\n",
  "```js\nconst x = 1;\n```\n\nAfter code.\n",
  "- [ ] task one @2024-06-20\n- [x] done task due: 2024-01-01\n",
  "Unicode: \u65e5\u672c\u8a9e tag #\u65e5\u672c\u8a9e emoji \u{1F4C5} 2024-06-20\n\nSecond \u6bb5\u843d\n",
  "line one  \nline two  \nline three\n",
  "> quote\n>\n> more\n",
  "1. first\n2. second\n",
  "text with #tag and #proj/sub-task_1 tail\n",
  "para one ^abc123\n\npara two\n",
  "\n\n\n",
  "",
];

function at(values: Int32Array, index: number): number {
  const value = values[index];
  if (value === undefined) throw new Error(`missing offset ${String(index)}`);
  return value;
}

function md_doc(markdown: string) {
  return parse_markdown(markdown);
}

describe("build_offset_index", () => {
  it("matches the binary-searched mapping for every markdown offset", () => {
    for (const fixture of FIXTURES) {
      const doc = md_doc(fixture);
      const markdown = serialize_markdown(doc);
      const index = build_offset_index(doc, markdown);

      expect(index.prose_positions).toHaveLength(index.md_offsets.length);

      for (let offset = 0; offset <= markdown.length + 2; offset++) {
        expect(
          md_offset_to_prose_pos_indexed(index, offset),
          `fixture ${JSON.stringify(fixture)} offset ${String(offset)}`,
        ).toBe(md_offset_to_prose_pos(doc, offset, markdown));
      }
    }
  });

  it("keeps the breakpoint arrays monotonic", () => {
    for (const fixture of FIXTURES) {
      const doc = md_doc(fixture);
      const markdown = serialize_markdown(doc);
      const index = build_offset_index(doc, markdown);

      for (let i = 1; i < index.md_offsets.length; i++) {
        expect(at(index.prose_positions, i)).toBeGreaterThanOrEqual(
          at(index.prose_positions, i - 1),
        );
        expect(at(index.md_offsets, i)).toBeGreaterThanOrEqual(
          at(index.md_offsets, i - 1),
        );
      }
    }
  });

  it("round-trips prose positions through the index", () => {
    const doc = md_doc("hello world\n");
    const markdown = serialize_markdown(doc);
    const index = build_offset_index(doc, markdown);

    for (let pos = 2; pos <= 6; pos++) {
      const md_offset = prose_cursor_to_md_offset(doc, pos, markdown);
      expect(md_offset_to_prose_pos_indexed(index, md_offset)).toBe(pos);
    }
  });

  it("converts line/character positions like the linear scan", () => {
    for (const fixture of FIXTURES) {
      const doc = md_doc(fixture);
      const markdown = serialize_markdown(doc);
      const index = build_offset_index(doc, markdown);
      const lines = index.line_starts.length;

      for (let line = -1; line <= lines + 2; line++) {
        for (let character = -1; character <= 24; character++) {
          expect(
            md_offset_from_line_character_indexed(index, line, character),
            `fixture ${JSON.stringify(fixture)} line ${String(line)} char ${String(character)}`,
          ).toBe(md_offset_from_line_character(markdown, line, character));
        }
      }
    }
  });
});
