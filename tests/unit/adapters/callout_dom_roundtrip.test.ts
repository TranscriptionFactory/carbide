/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { DOMParser, DOMSerializer } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";

function make_callout_doc(folded: boolean): ProseNode {
  const callout = schema.nodes.callout.create(
    {
      callout_type: "tip",
      foldable: true,
      default_folded: false,
      folded,
    },
    [
      schema.nodes.callout_title.create(null, schema.text("Tip")),
      schema.nodes.callout_body.create(null, [
        schema.nodes.paragraph.create(null, schema.text("Content")),
      ]),
    ],
  );
  return schema.nodes.doc.create(null, [callout]);
}

function dom_roundtrip(doc: ProseNode): ProseNode {
  const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
    doc.content,
  );
  const container = document.createElement("div");
  container.appendChild(fragment);
  return DOMParser.fromSchema(schema).parse(container);
}

describe("callout DOM roundtrip", () => {
  it("preserves runtime folded state across a DOM serialize/parse cycle", () => {
    const reparsed = dom_roundtrip(make_callout_doc(true));
    const callout = reparsed.firstChild;
    expect(callout?.type.name).toBe("callout");
    expect(callout?.attrs["folded"]).toBe(true);
    expect(callout?.attrs["foldable"]).toBe(true);
    expect(callout?.attrs["default_folded"]).toBe(false);
  });

  it("preserves an unfolded callout across a DOM serialize/parse cycle", () => {
    const reparsed = dom_roundtrip(make_callout_doc(false));
    expect(reparsed.firstChild?.attrs["folded"]).toBe(false);
  });

  it("emits data-folded in the serialized DOM", () => {
    const fragment = DOMSerializer.fromSchema(schema).serializeFragment(
      make_callout_doc(true).content,
    );
    const container = document.createElement("div");
    container.appendChild(fragment);
    const el = container.querySelector("[data-callout]");
    expect(el?.getAttribute("data-folded")).toBe("true");
  });
});
