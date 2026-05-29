import { Plugin, PluginKey } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import {
  FileText,
  Music,
  Video,
  File,
  Image,
  Code,
  ExternalLink,
  ChevronRight,
} from "lucide-static";
import { create_logger } from "$lib/shared/utils/logger";
import {
  build_safe_embed_srcdoc,
  SAFE_EMBED_SANDBOX,
} from "./html_embed_renderer";

const log = create_logger("file_embed_view");

function get_icon_for_type(file_type: string): string {
  switch (file_type) {
    case "pdf":
      return FileText;
    case "audio":
      return Music;
    case "video":
      return Video;
    case "image":
      return Image;
    case "text":
      return Code;
    case "html":
      return Code;
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
  private _pdf_doc: { destroy(): void } | null = null;
  private node: ProseNode;
  private view: EditorView;
  private get_pos: () => number | undefined;
  private collapse_btn: HTMLButtonElement;
  private on_collapse: (e: MouseEvent) => void;

  constructor(
    node: ProseNode,
    view: EditorView,
    get_pos: () => number | undefined,
    callbacks: FileEmbedCallbacks,
  ) {
    this.node = node;
    this.view = view;
    this.get_pos = get_pos;

    const src = node.attrs["src"] as string;
    const file_type = node.attrs["file_type"] as string;
    const height = node.attrs["height"] as number;
    const filename = src.split("/").pop() || src;

    this.dom = document.createElement("div");
    this.dom.className = "file-embed";
    this.dom.contentEditable = "false";
    this.dom.setAttribute("data-file-type", file_type);
    this.dom.dataset["collapsed"] = String(node.attrs["collapsed"]);

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

    this.collapse_btn = document.createElement("button");
    this.collapse_btn.className = "file-embed-collapse";
    this.collapse_btn.title = "Toggle preview";
    this.collapse_btn.innerHTML = ChevronRight;
    this.on_collapse = (e: MouseEvent) => {
      e.preventDefault();
      const pos = this.get_pos();
      if (pos == null) return;
      this.view.dispatch(
        this.view.state.tr.setNodeMarkup(pos, null, {
          ...this.node.attrs,
          collapsed: !this.node.attrs["collapsed"],
        }),
      );
    };
    this.collapse_btn.addEventListener("click", this.on_collapse);
    toolbar.appendChild(this.collapse_btn);

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
      placeholder.textContent = "Loading PDF…";

      if (callbacks.resolve_asset_url) {
        const result = callbacks.resolve_asset_url(src);
        if (typeof result === "string") {
          content.appendChild(placeholder);
          void this._render_pdf_canvas(content, placeholder, result, node);
        } else {
          content.appendChild(placeholder);
          void result
            .then((url) => {
              if (this._destroyed) return;
              void this._render_pdf_canvas(content, placeholder, url, node);
            })
            .catch((error: unknown) => {
              log.error("Failed to resolve PDF asset URL", { error });
              placeholder.textContent = "Failed to load PDF";
            });
        }
      } else {
        placeholder.textContent = "PDF preview unavailable";
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
    } else if (file_type === "image") {
      const img = document.createElement("img");
      img.className = "file-embed-image";
      img.alt = filename;
      if (callbacks.resolve_asset_url) {
        const result = callbacks.resolve_asset_url(src);
        if (typeof result === "string") {
          img.src = result;
        } else {
          void result
            .then((url) => {
              if (!this._destroyed) img.src = url;
            })
            .catch((error: unknown) => {
              log.error("Failed to resolve image asset URL", { error });
            });
        }
      } else {
        img.src = src;
      }
      content.appendChild(img);
      content.style.height = "auto";
    } else if (file_type === "html") {
      const iframe = document.createElement("iframe");
      iframe.className = "file-embed-html";
      iframe.setAttribute("sandbox", SAFE_EMBED_SANDBOX);
      iframe.title = filename;
      iframe.style.width = "100%";
      iframe.style.height = "100%";
      iframe.style.border = "none";
      iframe.style.background = "transparent";
      content.appendChild(iframe);

      if (callbacks.resolve_asset_url) {
        const result = callbacks.resolve_asset_url(src);
        const load_html = (url: string) => {
          void fetch(url)
            .then((r) =>
              r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)),
            )
            .then(async (html_text) => {
              if (this._destroyed) return;
              const srcdoc = await build_safe_embed_srcdoc({
                content: html_text,
                host_file_path: src,
                resolve_asset_url: callbacks.resolve_asset_url,
              });
              if (this._destroyed) return;
              iframe.srcdoc = srcdoc;
            })
            .catch((error: unknown) => {
              log.error("Failed to load HTML embed", { error });
              if (!this._destroyed) {
                iframe.srcdoc = `<!DOCTYPE html><body style="font-family:sans-serif;color:#71717a;padding:12px;">Failed to load HTML embed</body>`;
              }
            });
        };
        if (typeof result === "string") {
          load_html(result);
        } else {
          void result
            .then((url) => {
              if (!this._destroyed) load_html(url);
            })
            .catch((error: unknown) => {
              log.error("Failed to resolve HTML asset URL", { error });
            });
        }
      } else {
        iframe.srcdoc = `<!DOCTYPE html><body style="font-family:sans-serif;color:#71717a;padding:12px;">HTML preview unavailable</body>`;
      }
    } else if (file_type === "text") {
      const pre = document.createElement("pre");
      pre.className = "file-embed-text";
      const code_el = document.createElement("code");
      pre.appendChild(code_el);
      content.appendChild(pre);

      if (callbacks.resolve_asset_url) {
        const result = callbacks.resolve_asset_url(src);
        const load_text = (url: string) => {
          void fetch(url)
            .then((r) =>
              r.ok ? r.text() : Promise.reject(new Error(`HTTP ${r.status}`)),
            )
            .then((text) => {
              if (!this._destroyed) {
                code_el.textContent = text;
              }
            })
            .catch((error: unknown) => {
              log.error("Failed to load text file", { error });
              if (!this._destroyed) {
                code_el.textContent = "Failed to load file";
              }
            });
        };
        if (typeof result === "string") {
          load_text(result);
        } else {
          void result
            .then((url) => {
              if (!this._destroyed) load_text(url);
            })
            .catch((error: unknown) => {
              log.error("Failed to resolve text asset URL", { error });
            });
        }
      } else {
        code_el.textContent = "Preview unavailable";
      }
    } else {
      const unknown = document.createElement("div");
      unknown.className = "file-embed-unknown";
      unknown.textContent = `Cannot preview: ${filename}`;
      content.appendChild(unknown);
    }

    this.dom.appendChild(content);
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "file_embed") return false;
    this.node = updated;
    this.dom.dataset["collapsed"] = String(updated.attrs["collapsed"]);
    return true;
  }

  private async _render_pdf_canvas(
    container: HTMLElement,
    placeholder: HTMLElement,
    url: string,
    node: ProseNode,
  ): Promise<void> {
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        "pdfjs-dist/build/pdf.worker.mjs",
        import.meta.url,
      ).toString();

      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${String(resp.status)}`);
      const data = new Uint8Array(await resp.arrayBuffer());

      if (this._destroyed) return;

      const doc = await pdfjs.getDocument({ data }).promise;
      this._pdf_doc = doc;

      if (this._destroyed) {
        doc.destroy();
        return;
      }

      const target_page = (node.attrs["page"] as number | null) ?? 1;
      const page = await doc.getPage(
        Math.max(1, Math.min(doc.numPages, target_page)),
      );

      if (this._destroyed) return;

      const container_width = container.clientWidth || 600;
      const base_viewport = page.getViewport({ scale: 1.0 });
      const scale = container_width / base_viewport.width;
      const dpr = window.devicePixelRatio || 1;
      const viewport = page.getViewport({ scale: scale * dpr });
      const css_viewport = page.getViewport({ scale });

      const scroll_wrapper = document.createElement("div");
      scroll_wrapper.className = "file-embed-pdf-scroll";
      scroll_wrapper.style.overflow = "auto";
      scroll_wrapper.style.height = "100%";

      const canvas = document.createElement("canvas");
      canvas.className = "file-embed-canvas";
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${String(css_viewport.width)}px`;
      canvas.style.height = `${String(css_viewport.height)}px`;
      canvas.style.display = "block";

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        placeholder.textContent = "Canvas not available";
        return;
      }

      await page.render({ canvasContext: ctx, viewport }).promise;

      if (this._destroyed) return;

      placeholder.remove();
      scroll_wrapper.appendChild(canvas);
      container.appendChild(scroll_wrapper);
    } catch (error: unknown) {
      log.error("Failed to render PDF", { error });
      if (!this._destroyed) {
        placeholder.textContent = "Failed to load PDF";
      }
    }
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

  stopEvent(event: Event): boolean {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return false;
    return target.closest("button") !== null || target.closest("a") !== null;
  }

  ignoreMutation(): boolean {
    return true;
  }

  destroy(): void {
    this._destroyed = true;
    this.collapse_btn.removeEventListener("click", this.on_collapse);
    if (this._media_el) {
      this._media_el.pause();
      this._media_el.removeAttribute("src");
      this._media_el.load();
    }
    if (this._pdf_doc) {
      this._pdf_doc.destroy();
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
