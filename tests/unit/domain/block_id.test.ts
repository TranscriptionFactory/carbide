import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  block_supports_id,
  ensure_block_id_at,
  format_block_link,
  generate_block_id,
  parse_block_ids,
} from "$lib/features/editor/domain/block_id";
import { find_block_anchor_position } from "$lib/features/editor/adapters/block_anchor";
import {
  BLOCK_NODE_MATRIX,
  make_matrix_doc,
} from "../helpers/block_node_matrix";

const BLOCK_ID_SHAPE = /^[a-z0-9]{6}$/;

const ID_BEARING_NODES = new Set(["paragraph", "callout", "details_block"]);

function make_para(text?: string) {
  return schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : undefined,
  );
}

function make_state(doc: ProseNode) {
  return EditorState.create({ schema, doc });
}

function mint(state: EditorState, pos: number) {
  let next = state;
  const block_id = ensure_block_id_at(state, pos, (tr) => {
    next = state.apply(tr);
  });
  return { block_id, state: next };
}

function mint_or_throw(state: EditorState, pos: number) {
  const minted = mint(state, pos);
  if (!minted.block_id) throw new Error("no block id was minted");
  return { block_id: minted.block_id, state: minted.state };
}

function matrix_doc_for(node_type: string) {
  const matrix_case = BLOCK_NODE_MATRIX.find((c) => c.node_type === node_type);
  if (!matrix_case) throw new Error(`no matrix case for ${node_type}`);
  return make_matrix_doc(matrix_case.build);
}

describe("parse_block_ids", () => {
  it("reads a trailing block id with its text and 1-based line", () => {
    expect(parse_block_ids("intro\nthe claim ^abc123\noutro")).toEqual([
      { text: "the claim", block_id: "abc123", line: 2 },
    ]);
  });

  it("reads a block id that sits alone on its line", () => {
    expect(parse_block_ids("^abc123")).toEqual([
      { text: "", block_id: "abc123", line: 1 },
    ]);
  });

  it("ignores a caret that is not at the end of the line", () => {
    expect(parse_block_ids("see ^abc123 for details")).toEqual([]);
  });

  it("ignores a block reference inside a wiki link", () => {
    expect(parse_block_ids("as shown in [[note#^abc123]]")).toEqual([]);
  });
});

describe("generate_block_id", () => {
  it("mints a six character lowercase alphanumeric id", () => {
    expect(generate_block_id()).toMatch(BLOCK_ID_SHAPE);
  });

  it("does not repeat itself across a batch of mints", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generate_block_id()));
    expect(ids.size).toBe(500);
  });
});

describe("format_block_link", () => {
  it("drops the .md extension from the note path", () => {
    expect(format_block_link("notes/deep dive.md", "abc123")).toBe(
      "[[notes/deep dive#^abc123]]",
    );
  });

  it("leaves an extensionless path untouched", () => {
    expect(format_block_link("daily/2026-07-31", "abc123")).toBe(
      "[[daily/2026-07-31#^abc123]]",
    );
  });
});

describe("block_supports_id across the block node matrix", () => {
  it.each(BLOCK_NODE_MATRIX)(
    "reports id support for $label",
    ({ build, node_type }) => {
      const { doc, block_pos } = make_matrix_doc(build);
      expect(block_supports_id(doc, block_pos)).toBe(
        ID_BEARING_NODES.has(node_type),
      );
    },
  );

  it("refuses a position with no node", () => {
    const doc = schema.nodes.doc.create(null, [make_para("only")]);
    expect(block_supports_id(doc, doc.content.size)).toBe(false);
  });

  it("refuses a table because its text lives in isolating cells", () => {
    const cell = schema.nodes.table_cell.create(null, [make_para("value")]);
    const row = schema.nodes.table_row.create(null, [cell]);
    const table = schema.nodes.table.create(null, [row]);
    const doc = schema.nodes.doc.create(null, [table]);
    expect(block_supports_id(doc, 0)).toBe(false);
  });
});

describe("ensure_block_id_at", () => {
  it("appends a new id to the end of a paragraph", () => {
    const doc = schema.nodes.doc.create(null, [make_para("the claim")]);
    const { block_id, state } = mint(make_state(doc), 0);

    expect(block_id).toMatch(BLOCK_ID_SHAPE);
    expect(state.doc.child(0).textContent).toBe(`the claim ^${block_id}`);
  });

  it("reuses an existing id instead of appending a second one", () => {
    const doc = schema.nodes.doc.create(null, [make_para("the claim")]);
    const first = mint(make_state(doc), 0);
    const second = mint(first.state, 0);

    expect(second.block_id).toBe(first.block_id);
    expect(second.state.doc.child(0).textContent).toBe(
      `the claim ^${first.block_id}`,
    );
  });

  it("reads back an id that was authored by hand", () => {
    const doc = schema.nodes.doc.create(null, [make_para("the claim ^kept01")]);
    const { block_id, state } = mint(make_state(doc), 0);

    expect(block_id).toBe("kept01");
    expect(state.doc.child(0).textContent).toBe("the claim ^kept01");
  });

  it("anchors a callout on the last paragraph of its body", () => {
    const { doc, block_pos } = matrix_doc_for("callout");
    const { block_id, state } = mint_or_throw(make_state(doc), block_pos);

    expect(block_id).toMatch(BLOCK_ID_SHAPE);
    expect(state.doc.child(1).lastChild?.lastChild?.textContent).toBe(
      `callout body ^${block_id}`,
    );
    expect(find_block_anchor_position(state.doc, block_id)).not.toBeNull();
  });

  it("omits the separator space when the block is empty", () => {
    const doc = schema.nodes.doc.create(null, [make_para()]);
    const { block_id, state } = mint(make_state(doc), 0);

    expect(state.doc.child(0).textContent).toBe(`^${block_id}`);
  });

  it("keeps the id outside a trailing link mark", () => {
    const link = schema.marks.link.create({ href: "note.md" });
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text("see ", []),
      schema.text("note", [link]),
    ]);
    const doc = schema.nodes.doc.create(null, [paragraph]);
    const { block_id, state } = mint_or_throw(make_state(doc), 0);

    const appended = state.doc.child(0).lastChild;
    expect(appended?.text).toBe(` ^${block_id}`);
    expect(appended?.marks).toHaveLength(0);
  });

  it.each(["web_embed", "video"])(
    "refuses the attr-only %s node",
    (node_type) => {
      const { doc, block_pos } = matrix_doc_for(node_type);
      expect(mint(make_state(doc), block_pos).block_id).toBeNull();
    },
  );

  it("refuses a code block so the id never lands inside the fence", () => {
    const { doc, block_pos } = matrix_doc_for("code_block");
    const { block_id, state } = mint(make_state(doc), block_pos);

    expect(block_id).toBeNull();
    expect(state.doc.child(1).textContent).toBe("const a = 1");
  });
});
