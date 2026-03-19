import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

const PDF_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`;

const AUDIO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;

const VIDEO_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`;

const FILE_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`;

const EXPAND_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`;

function get_icon_for_type(file_type: string): string {
  switch (file_type) {
    case "pdf":
      return PDF_ICON_SVG;
    case "audio":
      return AUDIO_ICON_SVG;
    case "video":
      return VIDEO_ICON_SVG;
    default:
      return FILE_ICON_SVG;
  }
}

export type FileEmbedCallbacks = {
  on_open_file: (path: string) => void;
  resolve_asset_url?: ((src: string) => string | Promise<string>) | undefined;
};

class FileEmbedView implements NodeView {
  dom: HTMLElement;

  constructor(
    node: ProseNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    callbacks: FileEmbedCallbacks,
  ) {
    const src = node.attrs["src"] as string;
    const file_type = node.attrs["file_type"] as string;
    const height = node.attrs["height"] as number;
    const filename = src.split("/").pop() || src;

    this.dom = document.createElement("div");
    this.dom.className = "file-embed";
    this.dom.contentEditable = "false";
    this.dom.setAttribute("data-file-type", file_type);

    const toolbar = document.createElement("div");
    toolbar.className = "file-embed__toolbar";

    const icon_el = document.createElement("span");
    icon_el.className = "file-embed__icon";
    icon_el.innerHTML = get_icon_for_type(file_type);
    toolbar.appendChild(icon_el);

    const name_el = document.createElement("span");
    name_el.className = "file-embed__name";
    name_el.textContent = filename;
    toolbar.appendChild(name_el);

    const expand_btn = document.createElement("button");
    expand_btn.className = "file-embed__expand";
    expand_btn.title = "Open in tab";
    expand_btn.innerHTML = EXPAND_ICON_SVG;
    expand_btn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.on_open_file(src);
    });
    toolbar.appendChild(expand_btn);

    this.dom.appendChild(toolbar);

    const content = document.createElement("div");
    content.className = "file-embed__content";
    content.style.height = `${String(height)}px`;

    if (file_type === "pdf") {
      const placeholder = document.createElement("div");
      placeholder.className = "file-embed__pdf-placeholder";
      placeholder.textContent = "PDF preview";

      if (callbacks.resolve_asset_url) {
        const result = callbacks.resolve_asset_url(src);
        if (typeof result === "string") {
          this._render_pdf(content, result, node);
        } else {
          content.appendChild(placeholder);
          void result.then((url) => {
            placeholder.remove();
            this._render_pdf(content, url, node);
          });
        }
      } else {
        content.appendChild(placeholder);
      }
    } else if (file_type === "audio") {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.className = "file-embed__audio";
      this._resolve_and_set_src(audio, src, callbacks);
      content.appendChild(audio);
      content.style.height = "auto";
    } else if (file_type === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.className = "file-embed__video";
      this._resolve_and_set_src(video, src, callbacks);
      content.appendChild(video);
    } else {
      const unknown = document.createElement("div");
      unknown.className = "file-embed__unknown";
      unknown.textContent = `Cannot preview: ${filename}`;
      content.appendChild(unknown);
    }

    this.dom.appendChild(content);
  }

  private _render_pdf(
    container: HTMLElement,
    url: string,
    node: ProseNode,
  ): void {
    const iframe = document.createElement("iframe");
    iframe.className = "file-embed__iframe";
    const page = node.attrs["page"] as number | null;
    iframe.src = page != null ? `${url}#page=${String(page)}` : url;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    container.appendChild(iframe);
  }

  private _resolve_and_set_src(
    el: HTMLAudioElement | HTMLVideoElement,
    src: string,
    callbacks: FileEmbedCallbacks,
  ): void {
    if (callbacks.resolve_asset_url) {
      const result = callbacks.resolve_asset_url(src);
      if (typeof result === "string") {
        el.src = result;
      } else {
        void result.then((url) => {
          el.src = url;
        });
      }
    } else {
      el.src = src;
    }
  }

  stopEvent(): boolean {
    return true;
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export function create_file_embed_view_plugin(
  callbacks: FileEmbedCallbacks,
): Plugin {
  return new Plugin({
    key: new PluginKey("file-embed-view"),
    props: {
      nodeViews: {
        file_embed: (node, view, get_pos) =>
          new FileEmbedView(node, view, get_pos, callbacks),
      },
    },
  });
}
