/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { schema } from "$lib/features/editor/adapters/schema";

function make_para(text?: string) {
  return schema.nodes.paragraph.create(
    null,
    text ? schema.text(text) : undefined,
  );
}

function make_callout(title_text: string, body_text: string) {
  const title = schema.nodes.callout_title.create(
    null,
    title_text ? schema.text(title_text) : undefined,
  );
  const body = schema.nodes.callout_body.create(null, [make_para(body_text)]);
  return schema.nodes.callout.create(null, [title, body]);
}

function make_state(
  doc: ReturnType<typeof schema.nodes.doc.create>,
  pos: number,
) {
  const state = EditorState.create({ doc, schema });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, pos)),
  );
}

describe("cross-block selection (schema isolation)", () => {
  it("callout_title does not have isolating set", () => {
    const spec = schema.nodes.callout_title.spec;
    expect(spec.isolating).toBeFalsy();
  });

  it("details_summary does not have isolating set", () => {
    const spec = schema.nodes.details_summary.spec;
    expect(spec.isolating).toBeFalsy();
  });

  it("frontmatter retains isolating", () => {
    const spec = schema.nodes.frontmatter.spec;
    expect(spec.isolating).toBe(true);
  });

  it("allows TextSelection spanning from paragraph into callout content", () => {
    const doc = schema.nodes.doc.create(null, [
      make_para("Hello world"),
      make_callout("Note", "Body text here"),
    ]);

    const state = make_state(doc, 1);
    const end = doc.content.size - 2;
    const sel = TextSelection.create(doc, 1, end);
    const applied = state.apply(state.tr.setSelection(sel));

    expect(applied.selection.from).toBe(1);
    expect(applied.selection.to).toBe(end);
  });
});
