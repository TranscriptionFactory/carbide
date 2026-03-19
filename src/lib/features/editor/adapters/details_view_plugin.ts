import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { ChevronRight } from "lucide-static";

function resize_icon(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${String(size)}"`)
    .replace(/height="24"/, `height="${String(size)}"`);
}

const CHEVRON_SVG = resize_icon(ChevronRight, 16);

class DetailsBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private node: ProseNode;
  private toggle: HTMLButtonElement;
  private on_toggle: (e: MouseEvent) => void;

  constructor(
    node: ProseNode,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.node = node;

    this.dom = document.createElement("div");
    this.dom.className = "details-block";
    this.dom.dataset["open"] = String(node.attrs["open"]);

    this.toggle = document.createElement("button");
    this.toggle.className = "details-block__toggle";
    this.toggle.type = "button";
    this.toggle.contentEditable = "false";
    this.toggle.tabIndex = -1;
    this.toggle.innerHTML = CHEVRON_SVG;
    this.on_toggle = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle_open();
    };
    this.toggle.addEventListener("mousedown", this.on_toggle);

    this.contentDOM = document.createElement("div");
    this.contentDOM.className = "details-block__body";

    this.dom.appendChild(this.toggle);
    this.dom.appendChild(this.contentDOM);
  }

  private toggle_open() {
    const pos = this.getPos();
    if (pos == null) return;
    const tr = this.view.state.tr.setNodeMarkup(pos, null, {
      ...this.node.attrs,
      open: !this.node.attrs["open"],
    });
    this.view.dispatch(tr);
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "details_block") return false;
    this.node = updated;
    this.dom.dataset["open"] = String(updated.attrs["open"]);
    return true;
  }

  stopEvent(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof Node)) return false;
    return this.toggle.contains(target);
  }

  ignoreMutation(): boolean {
    return false;
  }

  destroy() {
    this.toggle.removeEventListener("mousedown", this.on_toggle);
  }
}

export function create_details_view_prose_plugin(): Plugin {
  return new Plugin({
    key: new PluginKey("details-view"),
    props: {
      nodeViews: {
        details_block: (node, view, getPos) =>
          new DetailsBlockView(node, view, getPos),
      },
    },
  });
}
