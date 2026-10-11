import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView, NodeView } from "prosemirror-view";
import type { Node as ProseNode } from "prosemirror-model";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import {
  normalize_footnote_label,
  number_footnotes,
  parse_footnote_definition,
} from "$lib/features/editor/domain/footnotes";

type FootnoteDefinitionEntry = { pos: number; body: string };

export type FootnoteIndex = {
  definitions: Map<string, FootnoteDefinitionEntry>;
  decorations: DecorationSet;
};

type FootnoteNumberSpec = { footnote_number: number };

const HOVER_DELAY = 150;

export const footnote_plugin_key = new PluginKey<FootnoteIndex>("footnotes");

function ref_label(node: ProseNode): string {
  return node.attrs["label"] as string;
}

function collect_footnotes(doc: ProseNode): FootnoteIndex {
  const refs: Array<{ pos: number; node: ProseNode }> = [];
  const definitions = new Map<string, FootnoteDefinitionEntry>();

  doc.descendants((node, pos) => {
    if (node.type.name === "footnote_ref") {
      refs.push({ pos, node });
      return false;
    }
    if (node.type.name === "footnote_def") {
      const def = parse_footnote_definition(node.textContent);
      const key = def ? normalize_footnote_label(def.label) : null;
      if (def && key && !definitions.has(key))
        definitions.set(key, { pos, body: def.body });
      return false;
    }
    return !node.type.spec.code;
  });

  const numbers = number_footnotes(
    refs.map(({ node }) => ref_label(node)),
    new Set(definitions.keys()),
  );
  const decorations = refs.flatMap(({ pos, node }) => {
    const n = numbers.get(normalize_footnote_label(ref_label(node)));
    if (n === undefined) return [];
    const spec: FootnoteNumberSpec = { footnote_number: n };
    return [Decoration.node(pos, pos + node.nodeSize, {}, spec)];
  });

  return {
    definitions,
    decorations: DecorationSet.create(doc, decorations),
  };
}

function footnote_number_of(
  decorations: readonly Decoration[],
): number | undefined {
  for (const deco of decorations) {
    const n = (deco.spec as Partial<FootnoteNumberSpec>).footnote_number;
    if (n !== undefined) return n;
  }
  return undefined;
}

class FootnoteRefView implements NodeView {
  dom: HTMLElement;

  constructor(
    private node: ProseNode,
    decorations: readonly Decoration[],
  ) {
    this.dom = document.createElement("span");
    this.dom.className = "footnote-ref";
    this.dom.dataset["type"] = "footnote_ref";
    this.render(node, decorations);
  }

  update(node: ProseNode, decorations: readonly Decoration[]): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render(node, decorations);
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }

  private render(node: ProseNode, decorations: readonly Decoration[]) {
    const n = footnote_number_of(decorations);
    this.dom.dataset["label"] = ref_label(node);
    this.dom.classList.toggle("footnote-ref--resolved", n !== undefined);
    this.dom.textContent =
      n === undefined ? (node.attrs["raw"] as string) : String(n);
  }
}

function definition_for(
  view: EditorView,
  label: string,
): FootnoteDefinitionEntry | undefined {
  return footnote_plugin_key
    .getState(view.state)
    ?.definitions.get(normalize_footnote_label(label));
}

export function jump_to_footnote_definition(
  view: EditorView,
  label: string,
): boolean {
  const def = definition_for(view, label);
  if (!def) return false;
  const selection = TextSelection.create(view.state.doc, def.pos + 1);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
  return true;
}

function resolved_ref_at(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(
    "[data-type='footnote_ref'].footnote-ref--resolved",
  );
}

function create_popover_view(view: EditorView) {
  const popover = document.createElement("div");
  popover.className = "footnote-popover";
  popover.style.display = "none";
  document.body.appendChild(popover);

  let hover_timer: ReturnType<typeof setTimeout> | null = null;

  function clear_timer() {
    if (hover_timer === null) return;
    clearTimeout(hover_timer);
    hover_timer = null;
  }

  function hide() {
    clear_timer();
    popover.style.display = "none";
  }

  function show(ref_el: HTMLElement, body: string) {
    popover.textContent = body;
    popover.style.display = "block";
    popover.style.position = "fixed";
    void computePosition(ref_el, popover, {
      placement: "bottom-start",
      middleware: [offset(6), flip(), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      popover.style.left = `${String(x)}px`;
      popover.style.top = `${String(y)}px`;
    });
  }

  const on_mouseover = (event: MouseEvent) => {
    const ref_el = resolved_ref_at(event.target);
    if (!ref_el) return;
    const def = definition_for(view, ref_el.dataset["label"] ?? "");
    if (!def) return;
    clear_timer();
    hover_timer = setTimeout(() => {
      hover_timer = null;
      show(ref_el, def.body);
    }, HOVER_DELAY);
  };

  const on_mouseout = (event: MouseEvent) => {
    if (resolved_ref_at(event.target)) hide();
  };

  view.dom.addEventListener("mouseover", on_mouseover);
  view.dom.addEventListener("mouseout", on_mouseout);

  return {
    update(next: EditorView, prev_state: EditorView["state"]) {
      if (next.state.doc !== prev_state.doc) hide();
    },
    destroy() {
      clear_timer();
      view.dom.removeEventListener("mouseover", on_mouseover);
      view.dom.removeEventListener("mouseout", on_mouseout);
      popover.remove();
    },
  };
}

export function create_footnote_plugin(): Plugin<FootnoteIndex> {
  return new Plugin<FootnoteIndex>({
    key: footnote_plugin_key,
    state: {
      init(_config, state) {
        return collect_footnotes(state.doc);
      },
      apply(tr, index) {
        return tr.docChanged ? collect_footnotes(tr.doc) : index;
      },
    },
    props: {
      decorations(state) {
        return footnote_plugin_key.getState(state)?.decorations;
      },
      nodeViews: {
        footnote_ref: (node, _view, _get_pos, decorations) =>
          new FootnoteRefView(node, decorations),
      },
      handleClickOn(view, _pos, node, _node_pos, _event, direct) {
        if (!direct || node.type.name !== "footnote_ref") return false;
        return jump_to_footnote_definition(view, ref_label(node));
      },
    },
    view: create_popover_view,
  });
}
