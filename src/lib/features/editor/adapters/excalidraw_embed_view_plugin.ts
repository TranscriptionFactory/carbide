import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

const CANVAS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 9l3 3 4-4 3 3"/></svg>`;

type ExcalidrawEmbedCallbacks = {
  on_open_file: (path: string) => void;
};

class ExcalidrawEmbedView implements NodeView {
  dom: HTMLElement;

  constructor(
    node: ProseNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    callbacks: ExcalidrawEmbedCallbacks,
  ) {
    this.dom = document.createElement("div");
    this.dom.className = "excalidraw-embed";
    this.dom.contentEditable = "false";

    const icon = document.createElement("span");
    icon.className = "excalidraw-embed-icon";
    icon.innerHTML = CANVAS_ICON_SVG;

    const label = document.createElement("span");
    label.className = "excalidraw-embed-label";
    const src = node.attrs["src"] as string;
    label.textContent = src.split("/").pop() || src;

    this.dom.appendChild(icon);
    this.dom.appendChild(label);

    this.dom.addEventListener("click", () => {
      callbacks.on_open_file(src);
    });
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export function create_excalidraw_embed_view_plugin(
  callbacks: ExcalidrawEmbedCallbacks,
): Plugin {
  return new Plugin({
    key: new PluginKey("excalidraw-embed-view"),
    props: {
      nodeViews: {
        excalidraw_embed: (node, view, get_pos) =>
          new ExcalidrawEmbedView(node, view, get_pos, callbacks),
      },
    },
  });
}
