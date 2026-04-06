/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  compute_block_drop,
  apply_block_move,
} from "$lib/features/editor/domain/compute_block_drop";

function move_block(
  markdown: string,
  source_index: number,
  target_before_index: number,
): string {
  const doc = parse_markdown(markdown);
  const state = EditorState.create({ doc });

  let source_pos = 0;
  for (let i = 0; i < source_index; i++) {
    source_pos += doc.child(i).nodeSize;
  }

  let target_pos = 0;
  for (let i = 0; i < target_before_index; i++) {
    target_pos += doc.child(i).nodeSize;
  }

  const result = compute_block_drop(doc, source_pos, target_pos);
  if (!result) return serialize_markdown(doc);

  const tr = state.tr;
  apply_block_move(tr, result);
  return serialize_markdown(tr.doc);
}

describe("block drop markdown round-trip", () => {
  it("reorders paragraphs and preserves content", () => {
    const input = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n";
    const result = move_block(input, 0, 3);
    expect(result).toBe(
      "Second paragraph.\n\nThird paragraph.\n\nFirst paragraph.\n",
    );
  });

  it("moves heading with its content preserved", () => {
    const input = "# Title\n\nSome text.\n\n## Section\n";
    const result = move_block(input, 2, 0);
    expect(result).toBe("## Section\n\n# Title\n\nSome text.\n");
  });

  it("preserves code block language and content", () => {
    const input =
      "Intro text.\n\n```javascript\nconst x = 1;\n```\n\nAfter code.\n";
    const result = move_block(input, 1, 0);
    const output = result;
    expect(output).toContain("```javascript");
    expect(output).toContain("const x = 1;");
    expect(output.indexOf("const x")).toBeLessThan(output.indexOf("Intro"));
  });

  it("preserves blockquote content", () => {
    const input = "Before.\n\n> Quoted text here.\n\nAfter.\n";
    const result = move_block(input, 1, 0);
    expect(result).toContain("> Quoted text here.");
    expect(result.indexOf("Quoted")).toBeLessThan(result.indexOf("Before"));
  });

  it("preserves list items when moving a list block", () => {
    const input =
      "Intro.\n\n- Item one\n- Item two\n- Item three\n\nConclusion.\n";
    const result = move_block(input, 1, 3);
    expect(result).toContain("- Item one");
    expect(result).toContain("- Item two");
    expect(result).toContain("- Item three");
    expect(result.indexOf("Conclusion")).toBeLessThan(
      result.indexOf("Item one"),
    );
  });

  it("round-trips without content loss when no move needed", () => {
    const input = "# Heading\n\nParagraph one.\n\nParagraph two.\n";
    const doc = parse_markdown(input);
    const output = serialize_markdown(doc);
    expect(output).toBe(input);
  });

  it("handles horizontal rule reordering", () => {
    const input = "Above.\n\n---\n\nBelow.\n";
    const result = move_block(input, 1, 3);
    expect(result).toContain("Above.");
    expect(result).toContain("---");
    expect(result).toContain("Below.");
    expect(result.indexOf("Below")).toBeLessThan(result.indexOf("---"));
  });
});
