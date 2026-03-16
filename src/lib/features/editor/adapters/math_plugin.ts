import { $node, $prose } from "@milkdown/kit/utils";
import { type NodeView, type EditorView } from "@milkdown/kit/prose/view";
import { type Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { mount, unmount } from "svelte";
import katex from "katex";
import MathBlockEditor from "../ui/math_block_editor.svelte";

export const math_inline_node = $node("math_inline", () => ({
  group: "inline",
  inline: true,
  atom: true,
  marks: "",
  content: "text*",
  parseMarkdown: {
    match: (node) => node.type === "inlineMath",
    runner: (state, node, type) => {
      state.openNode(type);
      if (node.value) state.addText(node.value as string);
      state.closeNode();
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_inline",
    runner: (state, node) => {
      state.addNode("inlineMath", undefined, node.textContent);
    },
  },
  parseDOM: [
    {
      tag: "span[data-type='math_inline']",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return {};
      },
    },
  ],
  toDOM: () => ["span", { "data-type": "math_inline" }, 0],
}));

export const math_block_node = $node("math_block", () => ({
  group: "block",
  atom: true,
  marks: "",
  defining: true,
  isolating: true,
  attrs: { value: { default: "" } },
  parseMarkdown: {
    match: (node) => node.type === "math",
    runner: (state, node, type) => {
      state.addNode(type, { value: (node.value as string) ?? "" });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "math_block",
    runner: (state, node) => {
      state.addNode("math", undefined, node.attrs["value"] as string);
    },
  },
  parseDOM: [
    {
      tag: "div[data-type='math_block']",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) return false;
        return { value: dom.dataset["value"] ?? "" };
      },
    },
  ],
  toDOM: (node) => [
    "div",
    { "data-type": "math_block", "data-value": node.attrs["value"] as string },
    0,
  ],
}));

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
  private svelte_app: any;

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
    this.node = updated;
    return true;
  }

  destroy() {
    if (this.svelte_app) {
      unmount(this.svelte_app);
    }
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

export const math_view_plugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("math-view"),
      props: {
        nodeViews: {
          math_inline: (node) => new MathInlineNodeView(node),
          math_block: (node, view, get_pos) =>
            new MathBlockNodeView(node, view, get_pos),
        },
      },
    }),
);

export const math_plugin = [
  math_inline_node,
  math_block_node,
  math_view_plugin,
];
