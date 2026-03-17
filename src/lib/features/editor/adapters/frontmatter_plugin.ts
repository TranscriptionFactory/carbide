import { type NodeView, type EditorView } from "prosemirror-view";
import { type Node as ProseNode } from "prosemirror-model";
import { Plugin, PluginKey } from "prosemirror-state";
import { mount, unmount } from "svelte";
import FrontmatterWidget from "../ui/frontmatter_widget.svelte";

class FrontmatterNodeView implements NodeView {
  dom: HTMLElement;
  private svelte_app: Record<string, unknown> | undefined;

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
    return true;
  }

  destroy() {
    if (this.svelte_app) {
      void unmount(this.svelte_app);
    }
  }

  stopEvent(_event: Event): boolean {
    return true;
  }

  ignoreMutation() {
    return true;
  }
}

export function create_frontmatter_view_prose_plugin(): Plugin {
  return new Plugin({
    key: new PluginKey("frontmatter-view"),
    props: {
      nodeViews: {
        frontmatter: (node, view, get_pos) =>
          new FrontmatterNodeView(node, view, get_pos),
      },
    },
  });
}
