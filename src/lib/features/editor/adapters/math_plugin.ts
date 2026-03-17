import { type NodeView, type EditorView } from "prosemirror-view";
import { type Node as ProseNode, type Schema } from "prosemirror-model";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import { InputRule, inputRules } from "prosemirror-inputrules";
import { mount, unmount } from "svelte";
import katex from "katex";
import MathBlockEditor from "../ui/math_block_editor.svelte";

class MathInlineNodeView implements NodeView {
  dom: HTMLElement;

  constructor(private node: ProseNode) {
    this.dom = document.createElement("span");
    this.dom.className = "math-inline";
    this.dom.dataset["type"] = "math_inline";
    this._render();
  }

  private _render() {
    const code = this.node.textContent;
    try {
      this.dom.innerHTML = katex.renderToString(code, {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      this.dom.textContent = `$${code}$`;
    }
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "math_inline") return false;
    if (updated.textContent === this.node.textContent) {
      this.node = updated;
      return true;
    }
    this.node = updated;
    this._render();
    return true;
  }

  destroy() {}

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

class MathBlockNodeView implements NodeView {
  dom: HTMLElement;
  private svelte_app: Record<string, unknown> | undefined;

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private get_pos: () => number | undefined,
  ) {
    this.dom = document.createElement("div");
    this.dom.dataset["type"] = "math_block";

    this.svelte_app = mount(MathBlockEditor, {
      target: this.dom,
      props: {
        node: this.node,
        view: this.view,
        get_pos: this.get_pos,
      },
    });
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "math_block") return false;
    if (updated.attrs["value"] !== this.node.attrs["value"]) {
      this.node = updated;
      if (this.svelte_app) void unmount(this.svelte_app);
      this.svelte_app = mount(MathBlockEditor, {
        target: this.dom,
        props: {
          node: this.node,
          view: this.view,
          get_pos: this.get_pos,
        },
      });
    } else {
      this.node = updated;
    }
    return true;
  }

  destroy() {
    if (this.svelte_app) {
      void unmount(this.svelte_app);
    }
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

export function create_math_view_prose_plugin(): Plugin {
  return new Plugin({
    key: new PluginKey("math-view"),
    props: {
      nodeViews: {
        math_inline: (node) => new MathInlineNodeView(node),
        math_block: (node, view, get_pos) =>
          new MathBlockNodeView(node, view, get_pos),
      },
    },
  });
}

const INLINE_MATH_REGEX = /(?:^|[^$\\])\$([^$\n]+)\$$/;

export function find_inline_math_in_text(
  text: string,
): { content: string; match_start: number; match_end: number } | null {
  const match = INLINE_MATH_REGEX.exec(text);
  if (!match || !match[1]) return null;

  const full = match[0];
  const content = match[1];
  const prefix_len = full.length - content.length - 2;
  const match_start = match.index + prefix_len;
  const match_end = match_start + content.length + 2;

  return { content, match_start, match_end };
}

export function create_math_inline_input_prose_plugin(): Plugin {
  return new Plugin({
    key: new PluginKey("math-inline-input"),
    appendTransaction(transactions, _old_state, new_state) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const { $from } = new_state.selection;
      const parent = $from.parent;
      if (!parent.isTextblock) return null;
      if (parent.type.name === "code_block") return null;

      let combined = "";
      parent.forEach((child) => {
        if (child.isText && child.text) combined += child.text;
      });

      const text_before = combined.slice(0, $from.parentOffset);
      const result = find_inline_math_in_text(text_before);
      if (!result) return null;

      const math_type = new_state.schema.nodes["math_inline"];
      if (!math_type) return null;

      const block_start = $from.start();
      const abs_start = block_start + result.match_start;
      const abs_end = block_start + result.match_end;

      const math_node = math_type.create(
        null,
        result.content ? new_state.schema.text(result.content) : undefined,
      );

      const tr = new_state.tr.replaceWith(abs_start, abs_end, math_node);
      tr.setSelection(
        TextSelection.create(tr.doc, abs_start + math_node.nodeSize),
      );
      return tr;
    },
  });
}

export function create_math_block_input_rule_prose_plugin(
  schema: Schema,
): Plugin {
  const math_type = schema.nodes["math_block"];

  if (!math_type) {
    return new Plugin({ key: new PluginKey("math-block-input-dummy") });
  }

  const rule = new InputRule(/^\$\$$/, (state, _match, start, _end) => {
    const $start = state.doc.resolve(start);
    if (!$start.parent.isTextblock) return null;

    const block_start = $start.before();
    const block_end = $start.after();

    return state.tr.replaceWith(
      block_start,
      block_end,
      math_type.create({ value: "" }),
    );
  });

  return inputRules({ rules: [rule] });
}
