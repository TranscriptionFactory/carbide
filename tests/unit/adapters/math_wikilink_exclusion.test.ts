import { describe, it, expect } from "vitest";
import { Schema } from "@milkdown/kit/prose/model";
import { EditorState, PluginKey } from "@milkdown/kit/prose/state";
import { create_wiki_link_converter_prose_plugin } from "$lib/features/editor/adapters/wiki_link_plugin";
import type { Mark, MarkType } from "@milkdown/kit/prose/model";

function create_schema() {
  const link = {
    attrs: { href: {}, link_source: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: "a[href]",
        getAttrs: (dom: HTMLElement) => ({
          href: dom.getAttribute("href"),
          link_source: dom.getAttribute("data-link-source"),
        }),
      },
    ],
    toDOM: (mark: Mark, _inline: boolean) =>
      [
        "a",
        {
          href: String(mark.attrs["href"] ?? ""),
          "data-link-source": String(mark.attrs["link_source"] ?? ""),
        },
        0,
      ] as const,
  } as const;

  return new Schema({
    nodes: {
      doc: { content: "block+" },
      paragraph: {
        group: "block",
        content: "inline*",
        toDOM: () => ["p", 0] as const,
        parseDOM: [{ tag: "p" }],
      },
      math_block: {
        group: "block",
        atom: true,
        attrs: { value: { default: "" } },
        toDOM: (node) =>
          [
            "div",
            {
              "data-type": "math_block",
              "data-value": String(node.attrs["value"] ?? ""),
            },
          ] as const,
        parseDOM: [{ tag: "div[data-type='math_block']" }],
      },
      text: { group: "inline" },
    },
    marks: { link },
  });
}

function has_link_mark(
  doc: import("@milkdown/kit/prose/model").Node,
  link_type: MarkType,
): boolean {
  let found = false;
  doc.descendants((node) => {
    if (!node.isText) return true;
    if (node.marks.some((m: Mark) => m.type === link_type)) {
      found = true;
      return false;
    }
    return true;
  });
  return found;
}

describe("scan_textblock skips math_block nodes", () => {
  it("does not convert wikilinks inside text adjacent to math_block (no wiki in math node)", () => {
    const schema = create_schema();
    const plugin = create_wiki_link_converter_prose_plugin({
      link_type: schema.marks.link,
    });

    const math_node = schema.nodes["math_block"].create({ value: "x^2" });
    const para = schema.nodes["paragraph"].create(
      null,
      schema.text("plain text"),
    );
    const doc = schema.nodes["doc"].create(null, [math_node, para]);

    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
    });

    const tr = state.tr.setMeta(new PluginKey("wiki-link"), {
      action: "full_scan",
    });
    const new_state = state.apply(tr);

    expect(has_link_mark(new_state.doc, schema.marks.link)).toBe(false);
  });

  it("still converts wikilinks in paragraph nodes alongside math_block", () => {
    const schema = create_schema();
    const plugin = create_wiki_link_converter_prose_plugin({
      link_type: schema.marks.link,
    });

    const math_node = schema.nodes["math_block"].create({ value: "x^2" });
    const para = schema.nodes["paragraph"].create(
      null,
      schema.text("See [[note]]"),
    );
    const doc = schema.nodes["doc"].create(null, [math_node, para]);

    const state = EditorState.create({
      schema,
      doc,
      plugins: [plugin],
    });

    const insert_pos = doc.content.size - 1 - "See [[note]]".length + 4;
    const tr = state.tr.insertText("", insert_pos);
    const new_state = state.apply(tr);

    expect(new_state.doc.childCount).toBe(2);
  });
});
