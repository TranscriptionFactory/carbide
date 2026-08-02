/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { EditorState, type Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "$lib/features/editor/adapters/schema";
import {
  AMBIENT_ANCHOR_CLASS,
  ambient_anchor_plugin_key,
  create_ambient_anchor_plugin,
  update_prosemirror_ambient_anchors,
} from "$lib/features/editor/adapters/ambient_anchor_plugin";
import { make_ambient_notice } from "../helpers/assistant_notice_fixtures";

let view: EditorView | null = null;
let seen: Transaction[] = [];

function mount(text: string) {
  const state = EditorState.create({
    doc: schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, schema.text(text)),
    ]),
    schema,
    plugins: [create_ambient_anchor_plugin()],
  });

  const host = document.createElement("div");
  document.body.appendChild(host);
  seen = [];

  view = new EditorView(host, {
    state,
    dispatchTransaction(tr) {
      seen.push(tr);
      view?.updateState(view.state.apply(tr));
    },
  });

  return view;
}

function anchors(): NodeListOf<HTMLElement> {
  return document.body.querySelectorAll<HTMLElement>(
    `.${AMBIENT_ANCHOR_CLASS}`,
  );
}

function only_anchor(): HTMLElement {
  const found = anchors();
  expect(found).toHaveLength(1);
  const first = found[0];
  if (!first) throw new Error("expected exactly one anchor decoration");
  return first;
}

afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});

describe("ambient anchor decoration plugin", () => {
  it("decorates nothing when there are no notices", () => {
    const v = mount("links to fusion-weights today");

    update_prosemirror_ambient_anchors(v, []);

    expect(anchors()).toHaveLength(0);
  });

  it("underlines the anchored text of a resolvable notice", () => {
    const v = mount("links to fusion-weights today");
    const notice = make_ambient_notice({
      anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
    });

    update_prosemirror_ambient_anchors(v, [notice]);

    const found = only_anchor();
    expect(found.textContent).toBe("fusion-weights");
    expect(found.dataset.ambientNoticeId).toBe(notice.id);
  });

  it("renders no decoration for a note-level anchor", () => {
    const v = mount("links to fusion-weights today");

    update_prosemirror_ambient_anchors(v, [
      make_ambient_notice({ anchor: { kind: "note" } }),
    ]);

    expect(anchors()).toHaveLength(0);
  });

  it("keeps resolvable siblings when one notice in the batch cannot resolve", () => {
    const v = mount("links to fusion-weights today");
    const resolvable = make_ambient_notice({
      anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
    });
    const broken = make_ambient_notice({
      anchor: { kind: "text", match: "long-gone", occurrence: 0 },
    });

    update_prosemirror_ambient_anchors(v, [broken, resolvable]);

    expect(only_anchor().dataset.ambientNoticeId).toBe(resolvable.id);
  });

  // Two findings on the same phrase keep two decorations, but ProseMirror
  // renders them as ONE span — so overlapping notices never double-underline
  // the prose. Both halves matter, so both are asserted.
  it("keeps a decoration per notice on a shared range while rendering a single underline", () => {
    const v = mount("links to fusion-weights today");
    const anchor = {
      kind: "text" as const,
      match: "fusion-weights",
      occurrence: 0,
    };

    update_prosemirror_ambient_anchors(v, [
      make_ambient_notice({ anchor }),
      make_ambient_notice({ anchor }),
    ]);

    const plugin_state = ambient_anchor_plugin_key.getState(v.state);
    expect(plugin_state?.decorations.find()).toHaveLength(2);
    expect(anchors()).toHaveLength(1);
  });

  it("re-resolves after an edit above the anchor so the underline tracks the text", () => {
    const v = mount("links to fusion-weights today");
    update_prosemirror_ambient_anchors(v, [
      make_ambient_notice({
        anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
      }),
    ]);

    v.dispatch(v.state.tr.insert(1, schema.text("PREFIX ")));

    expect(only_anchor().textContent).toBe("fusion-weights");
  });

  it("drops the underline when the anchored text is edited away, rather than leaving a stale range", () => {
    const v = mount("links to fusion-weights today");
    update_prosemirror_ambient_anchors(v, [
      make_ambient_notice({
        anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
      }),
    ]);
    expect(anchors()).toHaveLength(1);

    const from = v.state.doc.content.size - 1;
    v.dispatch(v.state.tr.delete(1, from));

    expect(anchors()).toHaveLength(0);
  });

  it("clears every decoration when an empty batch is pushed", () => {
    const v = mount("links to fusion-weights today");
    update_prosemirror_ambient_anchors(v, [
      make_ambient_notice({
        anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
      }),
    ]);

    update_prosemirror_ambient_anchors(v, []);

    expect(anchors()).toHaveLength(0);
  });

  // I6, offer-only at the editor layer. This is the assertion that fails on a
  // block-id anchoring design, because ensure_block_id_at writes " ^abc123"
  // into the note in order to render.
  it("never originates a transaction that changes the document", () => {
    const v = mount("links to fusion-weights today");

    update_prosemirror_ambient_anchors(v, [
      make_ambient_notice({
        anchor: { kind: "text", match: "fusion-weights", occurrence: 0 },
      }),
    ]);
    update_prosemirror_ambient_anchors(v, []);

    expect(seen).toHaveLength(2);
    expect(seen.every((tr) => !tr.docChanged)).toBe(true);
    expect(v.state.doc.textContent).toBe("links to fusion-weights today");
  });
});
