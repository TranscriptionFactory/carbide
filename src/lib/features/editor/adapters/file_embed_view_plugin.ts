import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import { FileText, Music, Video, File, ExternalLink } from "lucide-static";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("file_embed_view");

function get_icon_for_type(file_type: string): string {
  switch (file_type) {
    case "pdf":
      return FileText;
    case "audio":
      return Music;
    case "video":
      return Video;
    default:
      return File;
  }
}

export type FileEmbedCallbacks = {
  on_open_file: (path: string) => void;
  resolve_asset_url?: ((src: string) => string | Promise<string>) | undefined;
};

class FileEmbedView implements NodeView {
  dom: HTMLElement;
  private _destroyed = false;
  private _media_el: HTMLAudioElement | HTMLVideoElement | null = null;
  private _iframe_el: HTMLIFrameElement | null = null;

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
    toolbar.className = "file-embed-toolbar";

    const icon_el = document.createElement("span");
    icon_el.className = "file-embed-icon";
    icon_el.innerHTML = get_icon_for_type(file_type);
    toolbar.appendChild(icon_el);

    const name_el = document.createElement("span");
    name_el.className = "file-embed-name";
    name_el.textContent = filename;
    toolbar.appendChild(name_el);

    const expand_btn = document.createElement("button");
    expand_btn.className = "file-embed-expand";
    expand_btn.title = "Open in tab";
    expand_btn.innerHTML = ExternalLink;
    expand_btn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.on_open_file(src);
    });
    toolbar.appendChild(expand_btn);

    this.dom.appendChild(toolbar);

    const content = document.createElement("div");
    content.className = "file-embed-content";
    content.style.height = `${String(height)}px`;

    if (file_type === "pdf") {
      const placeholder = document.createElement("div");
      placeholder.className = "file-embed-pdf-placeholder";
      placeholder.textContent = "PDF preview";

      if (callbacks.resolve_asset_url) {
        const result = callbacks.resolve_asset_url(src);
        if (typeof result === "string") {
          this._render_pdf(content, result, node);
        } else {
          content.appendChild(placeholder);
          void result
            .then((url) => {
              if (this._destroyed) return;
              placeholder.remove();
              this._render_pdf(content, url, node);
            })
            .catch((error: unknown) => {
              log.error("Failed to resolve PDF asset URL", { error });
              placeholder.textContent = "Failed to load PDF";
            });
        }
      } else {
        content.appendChild(placeholder);
      }
    } else if (file_type === "audio") {
      const audio = document.createElement("audio");
      audio.controls = true;
      audio.className = "file-embed-audio";
      this._media_el = audio;
      this._resolve_and_set_src(audio, src, callbacks);
      content.appendChild(audio);
      content.style.height = "auto";
    } else if (file_type === "video") {
      const video = document.createElement("video");
      video.controls = true;
      video.className = "file-embed-video";
      this._media_el = video;
      this._resolve_and_set_src(video, src, callbacks);
      content.appendChild(video);
    } else {
      const unknown = document.createElement("div");
      unknown.className = "file-embed-unknown";
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
    iframe.className = "file-embed-iframe";
    const page = node.attrs["page"] as number | null;
    iframe.src = page != null ? `${url}#page=${String(page)}` : url;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    this._iframe_el = iframe;
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
        void result
          .then((url) => {
            if (this._destroyed) return;
            el.src = url;
          })
          .catch((error: unknown) => {
            log.error("Failed to resolve media asset URL", { error });
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

  destroy(): void {
    this._destroyed = true;
    if (this._media_el) {
      this._media_el.pause();
      this._media_el.removeAttribute("src");
      this._media_el.load();
    }
    if (this._iframe_el) {
      this._iframe_el.src = "about:blank";
    }
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
