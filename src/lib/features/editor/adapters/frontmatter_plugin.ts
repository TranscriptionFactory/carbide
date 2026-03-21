import { type NodeView, type EditorView } from "prosemirror-view";
import { type Node as ProseNode } from "prosemirror-model";
import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
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

function escape_frontmatter(view: EditorView): boolean {
  const { state } = view;
  const { doc } = state;
  if (doc.firstChild?.type.name !== "frontmatter") return false;

  const fm_end = doc.firstChild.nodeSize;
  const has_content_after = doc.childCount > 1;

  if (has_content_after) {
    const tr = state.tr.setSelection(TextSelection.create(doc, fm_end + 1));
    view.dispatch(tr.scrollIntoView());
  } else {
    const para_type = state.schema.nodes["paragraph"];
    if (!para_type) return false;
    const tr = state.tr.insert(fm_end, para_type.create());
    view.dispatch(
      tr
        .setSelection(TextSelection.create(tr.doc, fm_end + 1))
        .scrollIntoView(),
    );
  }
  return true;
}

export function create_frontmatter_view_prose_plugin(): Plugin {
  return new Plugin({
    key: new PluginKey("frontmatter-view"),
    props: {
      nodeViews: {
        frontmatter: (node, view, get_pos) =>
          new FrontmatterNodeView(node, view, get_pos),
      },
      handleKeyDown(view, event) {
        if (event.key !== "ArrowDown" && event.key !== "Enter") return false;
        const { state } = view;
        const fm = state.doc.firstChild;
        if (!fm || fm.type.name !== "frontmatter") return false;

        const sel_end = state.selection.to;
        const fm_end = fm.nodeSize;
        if (sel_end > fm_end) return false;

        return escape_frontmatter(view);
      },
    },
  });
}
