import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

const CANVAS_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/><path d="M7 9l3 3 4-4 3 3"/></svg>`;

export type ExcalidrawEmbedCallbacks = {
  on_open_file: (path: string) => void;
  load_svg_preview?: (path: string) => Promise<string | null>;
};

class ExcalidrawEmbedView implements NodeView {
  dom: HTMLElement;
  private src: string;

  constructor(
    node: ProseNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    callbacks: ExcalidrawEmbedCallbacks,
  ) {
    this.src = node.attrs["src"] as string;

    this.dom = document.createElement("div");
    this.dom.className = "excalidraw-embed";
    this.dom.contentEditable = "false";

    this.dom.addEventListener("click", () => {
      callbacks.on_open_file(this.src);
    });

    if (callbacks.load_svg_preview) {
      this.#render_with_preview(callbacks.load_svg_preview);
    } else {
      this.#render_chip();
    }
  }

  #render_chip(): void {
    this.dom.classList.add("excalidraw-embed--chip");

    const icon = document.createElement("span");
    icon.className = "excalidraw-embed-icon";
    icon.innerHTML = CANVAS_ICON_SVG;

    const label = document.createElement("span");
    label.className = "excalidraw-embed-label";
    label.textContent = this.src.split("/").pop() || this.src;

    this.dom.appendChild(icon);
    this.dom.appendChild(label);
  }

  async #render_with_preview(
    load_svg: (path: string) => Promise<string | null>,
  ): Promise<void> {
    const svg = await load_svg(this.src);
    if (!svg) {
      this.#render_chip();
      return;
    }

    this.dom.classList.add("excalidraw-embed--preview");

    const preview = document.createElement("div");
    preview.className = "excalidraw-embed-preview";
    preview.innerHTML = svg;

    const svg_el = preview.querySelector("svg");
    if (svg_el) {
      svg_el.removeAttribute("width");
      svg_el.removeAttribute("height");
      svg_el.style.width = "100%";
      svg_el.style.height = "auto";
    }

    const label_bar = document.createElement("div");
    label_bar.className = "excalidraw-embed-label-bar";

    const icon = document.createElement("span");
    icon.className = "excalidraw-embed-icon";
    icon.innerHTML = CANVAS_ICON_SVG;

    const label = document.createElement("span");
    label.className = "excalidraw-embed-label";
    label.textContent = this.src.split("/").pop() || this.src;

    label_bar.appendChild(icon);
    label_bar.appendChild(label);

    this.dom.appendChild(preview);
    this.dom.appendChild(label_bar);
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
