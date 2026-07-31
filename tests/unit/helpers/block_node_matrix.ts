import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";

export type BlockNodeCase = {
  label: string;
  node_type: string;
  build: () => ProseNode;
};

function code_block(language: string, text: string) {
  return schema.nodes.code_block.create({ language }, schema.text(text));
}

function callout() {
  return schema.nodes.callout.create(
    { callout_type: "note", foldable: false, default_folded: false },
    [
      schema.nodes.callout_title.create(null, schema.text("Note")),
      schema.nodes.callout_body.create(null, [
        schema.nodes.paragraph.create(null, schema.text("callout body")),
      ]),
    ],
  );
}

function details_block() {
  return schema.nodes.details_block.create({ open: false }, [
    schema.nodes.details_summary.create(null, schema.text("Summary")),
    schema.nodes.details_content.create(null, [
      schema.nodes.paragraph.create(null, schema.text("details body")),
    ]),
  ]);
}

export const BLOCK_NODE_MATRIX: BlockNodeCase[] = [
  {
    label: "paragraph",
    node_type: "paragraph",
    build: () => schema.nodes.paragraph.create(null, schema.text("body")),
  },
  {
    label: "code_block (plain)",
    node_type: "code_block",
    build: () => code_block("", "const a = 1"),
  },
  {
    label: "code_block (mermaid preview)",
    node_type: "code_block",
    build: () => code_block("mermaid", "graph TD; A-->B;"),
  },
  {
    label: "code_block (html preview)",
    node_type: "code_block",
    build: () => code_block("html", "<b>hi</b>"),
  },
  { label: "callout", node_type: "callout", build: callout },
  { label: "details_block", node_type: "details_block", build: details_block },
  {
    label: "math_block",
    node_type: "math_block",
    build: () =>
      schema.nodes.math_block.create({ value: "x^2" }, schema.text("x^2")),
  },
  {
    label: "image-block",
    node_type: "image-block",
    build: () => schema.nodes["image-block"]!.create({ src: "shot.png" }),
  },
  {
    label: "file_embed",
    node_type: "file_embed",
    build: () => schema.nodes.file_embed.create({ src: "paper.pdf" }),
  },
  {
    label: "note_embed",
    node_type: "note_embed",
    build: () => schema.nodes.note_embed.create({ src: "other.md" }),
  },
  {
    label: "excalidraw_embed",
    node_type: "excalidraw_embed",
    build: () =>
      schema.nodes.excalidraw_embed.create({ src: "sketch.excalidraw" }),
  },
  {
    label: "web_embed",
    node_type: "web_embed",
    build: () => schema.nodes.web_embed.create({ src: "https://example.com" }),
  },
  {
    label: "video",
    node_type: "video",
    build: () => schema.nodes.video.create({ src: "clip.mp4" }),
  },
  {
    label: "raw_block",
    node_type: "raw_block",
    build: () => schema.nodes.raw_block.create(null, schema.text("<div/>")),
  },
  { label: "hr", node_type: "hr", build: () => schema.nodes.hr.create() },
];

export function make_matrix_doc(build: () => ProseNode): {
  doc: ProseNode;
  block_pos: number;
} {
  const before = schema.nodes.paragraph.create(null, schema.text("before"));
  const after = schema.nodes.paragraph.create(null, schema.text("after"));
  const doc = schema.nodes.doc.create(null, [before, build(), after]);
  return { doc, block_pos: before.nodeSize };
}
