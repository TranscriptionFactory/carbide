import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  parse_markdown,
  serialize_markdown,
} from "$lib/features/editor/adapters/markdown_pipeline";
import {
  ensure_block_id_at,
  parse_block_ids,
} from "$lib/features/editor/domain/block_id";
import { find_block_anchor_position } from "$lib/features/editor/adapters/block_anchor";

function mint_first_block(markdown: string) {
  const state = EditorState.create({ schema, doc: parse_markdown(markdown) });
  let next = state;
  const block_id = ensure_block_id_at(state, 0, (tr) => {
    next = state.apply(tr);
  });
  if (!block_id) throw new Error("no block id was minted");
  return { block_id, markdown: serialize_markdown(next.doc) };
}

describe("block id serialization round-trip", () => {
  it("keeps a trailing paragraph id verbatim", () => {
    const markdown = "the claim ^abc123\n";
    expect(serialize_markdown(parse_markdown(markdown))).toBe(markdown);
  });

  it("keeps a callout body id verbatim", () => {
    const markdown = "> [!note] Heads up\n> callout body ^abc123\n";
    expect(serialize_markdown(parse_markdown(markdown))).toBe(markdown);
  });

  it("keeps a standalone id line verbatim", () => {
    const markdown = "^abc123\n";
    expect(serialize_markdown(parse_markdown(markdown))).toBe(markdown);
  });
});

describe("minted block ids survive the save cycle", () => {
  it("stays parseable as a block id after serialize and reparse", () => {
    const minted = mint_first_block("the claim");

    expect(minted.markdown).toBe(`the claim ^${minted.block_id}\n`);
    expect(parse_block_ids(minted.markdown)).toEqual([
      { text: "the claim", block_id: minted.block_id, line: 1 },
    ]);
  });

  it("stays navigable through the reparsed document", () => {
    const minted = mint_first_block("the claim\n\noutro");
    const reparsed = parse_markdown(minted.markdown);
    const position = find_block_anchor_position(reparsed, minted.block_id);

    expect(position).not.toBeNull();
    expect(
      position === null ? null : reparsed.nodeAt(position)?.textContent,
    ).toBe(`the claim ^${minted.block_id}`);
  });

  it("stays navigable when the anchor lives inside a callout", () => {
    const minted = mint_first_block("> [!note] Note\n> callout body");
    const reparsed = parse_markdown(minted.markdown);

    expect(
      find_block_anchor_position(reparsed, minted.block_id),
    ).not.toBeNull();
  });
});
