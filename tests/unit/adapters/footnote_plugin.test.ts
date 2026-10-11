// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { schema } from "$lib/features/editor/adapters/schema";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  create_footnote_plugin,
  jump_to_footnote_definition,
} from "$lib/features/editor/adapters/footnote_plugin";

const views: EditorView[] = [];

function mount(doc: ProseNode): EditorView {
  const view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc, plugins: [create_footnote_plugin()] }),
  });
  views.push(view);
  return view;
}

function ref_elements(view: EditorView): HTMLElement[] {
  return [
    ...view.dom.querySelectorAll<HTMLElement>("[data-type='footnote_ref']"),
  ];
}

function displayed(view: EditorView): Array<[string, string]> {
  return ref_elements(view).map((el) => [
    el.dataset["label"] ?? "",
    el.textContent ?? "",
  ]);
}

function find_ref(
  doc: ProseNode,
  label: string,
): { pos: number; node: ProseNode } {
  let found: { pos: number; node: ProseNode } | null = null;
  doc.descendants((node, pos) => {
    if (node.type.name === "footnote_ref" && node.attrs["label"] === label)
      found = { pos, node };
    return !found;
  });
  if (!found) throw new Error(`no footnote_ref ${label}`);
  return found;
}

function popover(): HTMLElement {
  const el = document.querySelector<HTMLElement>(".footnote-popover");
  if (!el) throw new Error("footnote popover is not mounted");
  return el;
}

afterEach(() => {
  for (const view of views.splice(0)) view.destroy();
  vi.useRealTimers();
});

describe("footnote numbering", () => {
  it("numbers references 1 and 2 in document order", () => {
    const view = mount(
      parse_markdown("X[^a] Y[^b]\n\n[^a]: Alpha.\n\n[^b]: Beta."),
    );
    expect(displayed(view)).toEqual([
      ["a", "1"],
      ["b", "2"],
    ]);
  });

  it("numbers by first reference, not by definition order", () => {
    const view = mount(
      parse_markdown("X[^b] Y[^a] Z[^b]\n\n[^a]: Alpha.\n\n[^b]: Beta."),
    );
    expect(displayed(view)).toEqual([
      ["b", "1"],
      ["a", "2"],
      ["b", "1"],
    ]);
  });

  it("renumbers when references are reordered", () => {
    const view = mount(
      parse_markdown("X[^a] Y[^b]\n\n[^a]: Alpha.\n\n[^b]: Beta."),
    );
    const a = find_ref(view.state.doc, "a");
    const tr = view.state.tr.delete(a.pos, a.pos + a.node.nodeSize);
    const b = find_ref(tr.doc, "b");
    view.dispatch(tr.insert(b.pos + b.node.nodeSize, a.node));

    expect(displayed(view)).toEqual([
      ["b", "1"],
      ["a", "2"],
    ]);
  });

  it("renders a reference with no definition as its plain source", () => {
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.text("Dangling"),
      schema.nodes.footnote_ref.create({ label: "x", raw: "[^x]" }),
    ]);
    const view = mount(schema.nodes.doc.create(null, [paragraph]));
    const [ref] = ref_elements(view);

    expect(ref?.textContent).toBe("[^x]");
    expect(ref?.classList.contains("footnote-ref--resolved")).toBe(false);
  });
});

describe("footnote hover popover", () => {
  it("shows the definition body when hovering a reference", () => {
    vi.useFakeTimers();
    const view = mount(
      parse_markdown("Claim[^1].\n\n[^1]: line one\n  line two"),
    );
    const [ref] = ref_elements(view);
    ref?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(200);

    expect(popover().style.display).toBe("block");
    expect(popover().textContent).toBe("line one\nline two");

    ref?.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));
    expect(popover().style.display).toBe("none");
  });

  it("shows nothing when hovering a reference with no definition", () => {
    vi.useFakeTimers();
    const paragraph = schema.nodes.paragraph.create(null, [
      schema.nodes.footnote_ref.create({ label: "x", raw: "[^x]" }),
    ]);
    const view = mount(schema.nodes.doc.create(null, [paragraph]));
    const [ref] = ref_elements(view);
    ref?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(200);

    expect(popover().style.display).toBe("none");
  });
});

describe("footnote click", () => {
  it("moves the selection into the definition", () => {
    const view = mount(parse_markdown("Claim[^1].\n\nMiddle.\n\n[^1]: Body."));
    const def_pos =
      view.state.doc.child(0).nodeSize + view.state.doc.child(1).nodeSize;

    expect(jump_to_footnote_definition(view, "1")).toBe(true);
    expect(view.state.selection.from).toBe(def_pos + 1);
    expect(
      view.state.doc.resolve(view.state.selection.from).parent.type.name,
    ).toBe("footnote_def");
  });

  it("jumps when a reference is clicked directly", () => {
    const plugin = create_footnote_plugin();
    const view = mount(parse_markdown("Claim[^1].\n\n[^1]: Body."));
    const ref = find_ref(view.state.doc, "1");
    const handled = plugin.props.handleClickOn?.call(
      plugin,
      view,
      ref.pos,
      ref.node,
      ref.pos,
      new MouseEvent("click"),
      true,
    );

    expect(handled).toBe(true);
    expect(
      view.state.doc.resolve(view.state.selection.from).parent.type.name,
    ).toBe("footnote_def");
  });

  it("does nothing for a label without a definition", () => {
    const view = mount(parse_markdown("Claim."));
    const before = view.state.selection;

    expect(jump_to_footnote_definition(view, "missing")).toBe(false);
    expect(view.state.selection.eq(before)).toBe(true);
  });
});
