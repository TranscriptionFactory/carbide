import { $node, $prose } from "@milkdown/kit/utils";
import { type NodeView, type EditorView } from "@milkdown/kit/prose/view";
import { type Node as ProseNode } from "@milkdown/kit/prose/model";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import { mount, unmount } from "svelte";
import FrontmatterWidget from "../ui/frontmatter_widget.svelte";

export const frontmatter_node = $node("frontmatter", () => ({
  group: "block",
  content: "",
  attrs: {},
  parseMarkdown: {
    match: (node) => node.type === "yaml",
    runner: (state, node, type) => {
      state.addNode(type, { value: node.value as string });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === "frontmatter",
    runner: (state, node) => {
      state.addNode("yaml", undefined, node.textContent);
    },
  },
  parseDOM: [
    {
      tag: "div[data-type='frontmatter']",
      getAttrs: (dom) => {
        if (!(dom instanceof HTMLElement)) {
          throw new Error("Expected HTMLElement");
        }
        return {};
      },
    },
  ],
  toDOM: () => ["div", { "data-type": "frontmatter" }, 0],
}));

class FrontmatterNodeView implements NodeView {
  dom: HTMLElement;
  private svelte_app: any;

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private get_pos: () => number | undefined,
  ) {
    this.dom = document.createElement("div");
    this.dom.dataset["type"] = "frontmatter";

    this.svelte_app = mount(FrontmatterWidget, {
      target: this.dom,
      props: {
        node: this.node,
        view: this.view,
        get_pos: this.get_pos,
      },
    });
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "frontmatter") return false;
    this.node = updated;
    // Props in Svelte 5 are usually handled via runes or passing the same object
    // Since we don't have an easy way to update props from here without reassignment if they are not runes,
    // let's hope the widget handles it via reactivity if we can pass it down.
    return true;
  }

  destroy() {
    if (this.svelte_app) {
      unmount(this.svelte_app);
    }
  }

  stopEvent(event: Event): boolean {
    return true; // Handle all events inside the widget
  }

  ignoreMutation() {
    return true;
  }
}

export const frontmatter_view_plugin = $prose(
  () =>
    new Plugin({
      key: new PluginKey("frontmatter-view"),
      props: {
        nodeViews: {
          frontmatter: (node, view, get_pos) =>
            new FrontmatterNodeView(node, view, get_pos),
        },
      },
    }),
);

export const frontmatter_plugin = [frontmatter_node, frontmatter_view_plugin];
