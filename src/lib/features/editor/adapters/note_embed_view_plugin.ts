import { Plugin, PluginKey } from "prosemirror-state";
import { DOMSerializer } from "prosemirror-model";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";
import {
  FileText,
  ExternalLink,
  ChevronRight,
} from "lucide-static";
import type { VaultFsEvent } from "$lib/features/watcher/types/watcher";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("note_embed_view");

export type NoteEmbedCallbacks = {
  on_open_note: (path: string, fragment?: string) => void;
  read_note: (note_path: string) => Promise<string>;
  parse_markdown: (markdown: string) => ProseNode;
  subscribe_to_changes: (handler: (event: VaultFsEvent) => void) => () => void;
};

function extract_heading_section(
  markdown: string,
  heading_name: string,
): string {
  const lines = markdown.split("\n");
  const heading_lower = heading_name.toLowerCase();
  let start_idx = -1;
  let start_level = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const heading_match = /^(#{1,6})\s+(.+)$/.exec(line);
    if (!heading_match) continue;
    const level = heading_match[1]!.length;
    const text = heading_match[2]!.trim();

    if (start_idx === -1) {
      if (text.toLowerCase() === heading_lower) {
        start_idx = i;
        start_level = level;
      }
    } else {
      if (level <= start_level) {
        return lines.slice(start_idx, i).join("\n");
      }
    }
  }

  if (start_idx !== -1) {
    return lines.slice(start_idx).join("\n");
  }
  return "";
}

function extract_block_by_id(markdown: string, block_id: string): string {
  const lines = markdown.split("\n");
  const suffix = `^${block_id}`;
  for (const line of lines) {
    const trimmed = line.trimEnd();
    if (trimmed.endsWith(suffix)) {
      return trimmed.slice(0, trimmed.length - suffix.length).trimEnd();
    }
  }
  return "";
}

class NoteEmbedView implements NodeView {
  dom: HTMLElement;
  private _destroyed = false;
  private _collapsed = false;
  private _content_el: HTMLElement;
  private _unsubscribe: (() => void) | null = null;
  private _src: string;
  private _fragment: string | null;
  private _callbacks: NoteEmbedCallbacks;

  constructor(
    node: ProseNode,
    _view: EditorView,
    _getPos: () => number | undefined,
    callbacks: NoteEmbedCallbacks,
  ) {
    this._src = node.attrs["src"] as string;
    this._fragment = node.attrs["fragment"] as string | null;
    const display_src = node.attrs["display_src"] as string;
    this._callbacks = callbacks;

    const display_name = display_src || this._src.replace(/\.md$/i, "");

    this.dom = document.createElement("div");
    this.dom.className = "note-embed";
    this.dom.contentEditable = "false";

    const toolbar = document.createElement("div");
    toolbar.className = "note-embed__toolbar";

    const icon_el = document.createElement("span");
    icon_el.className = "note-embed__icon";
    icon_el.innerHTML = FileText;
    toolbar.appendChild(icon_el);

    const name_el = document.createElement("span");
    name_el.className = "note-embed__name";
    name_el.textContent = display_name;
    toolbar.appendChild(name_el);

    const collapse_btn = document.createElement("button");
    collapse_btn.className = "note-embed__collapse";
    collapse_btn.title = "Toggle preview";
    collapse_btn.innerHTML = ChevronRight;
    collapse_btn.dataset["expanded"] = "true";
    collapse_btn.addEventListener("click", (e) => {
      e.stopPropagation();
      this._collapsed = !this._collapsed;
      collapse_btn.dataset["expanded"] = String(!this._collapsed);
      this._content_el.style.display = this._collapsed ? "none" : "";
    });
    toolbar.appendChild(collapse_btn);

    const open_btn = document.createElement("button");
    open_btn.className = "note-embed__open";
    open_btn.title = "Open in tab";
    open_btn.innerHTML = ExternalLink;
    open_btn.addEventListener("click", (e) => {
      e.stopPropagation();
      callbacks.on_open_note(this._src, this._fragment ?? undefined);
    });
    toolbar.appendChild(open_btn);

    this.dom.appendChild(toolbar);

    this._content_el = document.createElement("div");
    this._content_el.className = "note-embed__content";
    this._content_el.contentEditable = "false";
    this.dom.appendChild(this._content_el);

    void this._render_content();

    this._unsubscribe = callbacks.subscribe_to_changes((event) => {
      if (this._destroyed) return;
      if (
        event.type === "note_changed_externally" &&
        event.note_path === this._src
      ) {
        void this._render_content();
      }
    });
  }

  private async _render_content(): Promise<void> {
    try {
      const markdown = await this._callbacks.read_note(this._src);
      if (this._destroyed) return;

      let content_md = markdown;
      if (this._fragment) {
        if (this._fragment.startsWith("^")) {
          content_md = extract_block_by_id(markdown, this._fragment.slice(1));
        } else {
          content_md = extract_heading_section(markdown, this._fragment);
        }
      }

      if (!content_md) {
        this._content_el.textContent = this._fragment
          ? `Fragment "${this._fragment}" not found`
          : "Empty note";
        return;
      }

      const doc = this._callbacks.parse_markdown(content_md);
      const serializer = DOMSerializer.fromSchema(doc.type.schema);
      const fragment = serializer.serializeFragment(doc.content);

      this._content_el.innerHTML = "";
      this._content_el.appendChild(fragment);
    } catch (error: unknown) {
      log.error("Failed to render note embed", { error });
      if (!this._destroyed) {
        this._content_el.textContent = "Failed to load note";
      }
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
    if (this._unsubscribe) {
      this._unsubscribe();
      this._unsubscribe = null;
    }
  }
}

export function create_note_embed_view_plugin(
  callbacks: NoteEmbedCallbacks,
): Plugin {
  return new Plugin({
    key: new PluginKey("note-embed-view"),
    props: {
      nodeViews: {
        note_embed: (node, view, get_pos) =>
          new NoteEmbedView(node, view, get_pos, callbacks),
      },
    },
  });
}
