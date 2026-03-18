import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type {
  EditorView,
  NodeView,
  ViewMutationRecord,
} from "prosemirror-view";
import { Check, Copy } from "lucide-static";
import { find_language_label, search_languages } from "./language_registry";
import { LruCache } from "$lib/shared/utils/lru_cache";
import { schema } from "./schema";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("code_block_view");

const mermaid_svg_cache = new LruCache<string, string>(128);
let mermaid_initialized_theme: string | null = null;

function resize_icon(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${String(size)}"`)
    .replace(/height="24"/, `height="${String(size)}"`);
}

const COPY_SVG = resize_icon(Copy, 14);
const CHECK_SVG = resize_icon(Check, 14);

function create_copy_button(code_el: HTMLElement): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "code-block-copy";
  button.contentEditable = "false";
  button.type = "button";
  button.setAttribute("aria-label", "Copy code");
  button.innerHTML = COPY_SVG;

  button.addEventListener("mousedown", (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  button.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const text = code_el.textContent ?? "";
    void navigator.clipboard.writeText(text).then(() => {
      button.innerHTML = CHECK_SVG;
      button.classList.add("code-block-copy--copied");
      setTimeout(() => {
        button.innerHTML = COPY_SVG;
        button.classList.remove("code-block-copy--copied");
      }, 1500);
    });
  });

  return button;
}

function create_language_picker(
  current_lang: string,
  on_select: (lang: string) => void,
  on_dismiss: () => void,
): HTMLElement {
  const picker = document.createElement("div");
  picker.className = "code-lang-picker";

  const search_input = document.createElement("input");
  search_input.className = "code-lang-search";
  search_input.type = "text";
  search_input.placeholder = "Search languages...";
  search_input.value = "";
  picker.appendChild(search_input);

  const list = document.createElement("div");
  list.className = "code-lang-list";
  picker.appendChild(list);

  function render_list(query: string) {
    list.innerHTML = "";
    const { popular, all } = search_languages(query);

    if (popular.length > 0 && !query) {
      const group_label = document.createElement("div");
      group_label.className = "code-lang-group-label";
      group_label.textContent = "Popular";
      list.appendChild(group_label);

      for (const lang of popular) {
        const option = document.createElement("button");
        option.className =
          lang.id === current_lang
            ? "code-lang-option active"
            : "code-lang-option";
        option.type = "button";
        option.textContent = lang.label;
        option.addEventListener("mousedown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          on_select(lang.id);
          on_dismiss();
        });
        list.appendChild(option);
      }

      const all_label = document.createElement("div");
      all_label.className = "code-lang-group-label";
      all_label.textContent = "All Languages";
      list.appendChild(all_label);
    }

    const display_list = query ? all : all;
    for (const lang of display_list) {
      if (!query && popular.some((p) => p.id === lang.id)) {
        continue;
      }
      const option = document.createElement("button");
      option.className =
        lang.id === current_lang
          ? "code-lang-option active"
          : "code-lang-option";
      option.type = "button";
      option.textContent = lang.label;
      option.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        on_select(lang.id);
        on_dismiss();
      });
      list.appendChild(option);
    }
  }

  render_list("");

  search_input.addEventListener("input", () => {
    render_list(search_input.value);
  });

  search_input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      on_dismiss();
    }
  });

  requestAnimationFrame(() => {
    search_input.focus();
  });

  return picker;
}

type MermaidState = {
  is_preview: boolean;
  preview_container: HTMLElement;
  toggle_btn: HTMLButtonElement;
  render_timer: ReturnType<typeof setTimeout> | undefined;
  last_rendered_content: string;
};

function mermaid_cache_key(code: string): string {
  const theme =
    document.documentElement.getAttribute("data-color-scheme") === "dark"
      ? "dark"
      : "default";
  return `${theme}:${code}`;
}

async function render_mermaid_preview(
  code: string,
  container: HTMLElement,
): Promise<void> {
  if (!code.trim()) {
    container.innerHTML = '<div class="mermaid-empty">Empty diagram</div>';
    return;
  }

  const key = mermaid_cache_key(code);
  const cached_svg = mermaid_svg_cache.get(key);
  if (cached_svg !== undefined) {
    container.innerHTML = cached_svg;
    return;
  }

  container.innerHTML =
    '<div class="mermaid-loading"><div class="mermaid-spinner"></div></div>';

  try {
    const mermaid = await import("mermaid");
    const theme =
      document.documentElement.getAttribute("data-color-scheme") === "dark"
        ? "dark"
        : "default";

    if (mermaid_initialized_theme !== theme) {
      mermaid.default.initialize({
        startOnLoad: false,
        theme,
        securityLevel: "strict",
      });
      mermaid_initialized_theme = theme;
    }

    await mermaid.default.parse(code);

    const id = `mermaid-${String(Date.now())}`;
    const { svg } = await mermaid.default.render(id, code);
    mermaid_svg_cache.set(key, svg);
    container.innerHTML = svg;
  } catch (error: unknown) {
    log.error("Mermaid render failed", { error });
    container.innerHTML = '<div class="mermaid-error">Invalid diagram</div>';
  }
}

class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private toolbar: HTMLElement;
  private lang_label: HTMLButtonElement;
  private picker_el: HTMLElement | null = null;
  private backdrop_el: HTMLElement | null = null;
  private mermaid: MermaidState | null = null;
  private current_language: string;

  constructor(
    private node: ProseNode,
    private view: EditorView,
    private get_pos: () => number | undefined,
  ) {
    this.current_language = (node.attrs.language as string) ?? "";

    this.dom = document.createElement("div");
    this.dom.className = "code-block-wrapper";

    this.toolbar = document.createElement("div");
    this.toolbar.className = "code-block-toolbar";
    this.toolbar.contentEditable = "false";

    this.lang_label = document.createElement("button");
    this.lang_label.className = "code-lang-label";
    this.lang_label.type = "button";
    this.lang_label.textContent = find_language_label(this.current_language);
    this.lang_label.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle_picker();
    });

    this.toolbar.appendChild(this.lang_label);

    const pre = document.createElement("pre");
    this.contentDOM = document.createElement("code");

    if (this.current_language) {
      this.contentDOM.classList.add(
        `language-${String(this.current_language)}`,
      );
    }

    pre.appendChild(this.contentDOM);

    const copy_btn = create_copy_button(this.contentDOM);
    this.toolbar.appendChild(copy_btn);

    this.dom.appendChild(this.toolbar);
    this.dom.appendChild(pre);

    if (this.current_language === "mermaid") {
      this.setup_mermaid(pre);
    }
  }

  private setup_mermaid(pre: HTMLElement) {
    const preview_container = document.createElement("div");
    preview_container.className = "mermaid-preview";

    const toggle_btn = document.createElement("button");
    toggle_btn.className = "mermaid-toggle-btn";
    toggle_btn.type = "button";
    toggle_btn.textContent = "Edit";
    toggle_btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle_mermaid_preview(pre);
    });

    this.toolbar.insertBefore(toggle_btn, this.toolbar.lastChild);
    this.dom.appendChild(preview_container);

    this.mermaid = {
      is_preview: true,
      preview_container,
      toggle_btn,
      render_timer: undefined,
      last_rendered_content: this.node.textContent,
    };

    pre.style.display = "none";
    this.schedule_mermaid_render();
  }

  private toggle_mermaid_preview(pre: HTMLElement) {
    if (!this.mermaid) return;
    this.mermaid.is_preview = !this.mermaid.is_preview;

    if (this.mermaid.is_preview) {
      pre.style.display = "none";
      this.mermaid.preview_container.style.display = "";
      this.mermaid.toggle_btn.textContent = "Edit";
      this.schedule_mermaid_render();
    } else {
      pre.style.display = "";
      this.mermaid.preview_container.style.display = "none";
      this.mermaid.toggle_btn.textContent = "Preview";
    }
  }

  private schedule_mermaid_render() {
    if (!this.mermaid) return;
    clearTimeout(this.mermaid.render_timer);
    this.mermaid.render_timer = setTimeout(() => {
      if (!this.mermaid) return;
      const code = this.node.textContent;
      void render_mermaid_preview(code, this.mermaid.preview_container);
    }, 150);
  }

  private teardown_mermaid() {
    if (!this.mermaid) return;
    clearTimeout(this.mermaid.render_timer);
    this.mermaid.preview_container.remove();
    this.mermaid.toggle_btn.remove();
    this.mermaid = null;
    const pre = this.dom.querySelector("pre");
    if (pre) pre.style.display = "";
  }

  private toggle_picker() {
    if (this.picker_el) {
      this.dismiss_picker();
      return;
    }

    this.picker_el = create_language_picker(
      this.current_language,
      (lang) => {
        const pos = this.get_pos();
        if (pos === undefined) return;
        const node = this.view.state.doc.nodeAt(pos);
        if (!node) return;
        const tr = this.view.state.tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          language: lang,
        });
        this.view.dispatch(tr);
      },
      () => {
        this.dismiss_picker();
      },
    );

    const rect = this.lang_label.getBoundingClientRect();
    this.picker_el.style.position = "fixed";
    this.picker_el.style.top = `${String(rect.bottom + 4)}px`;
    this.picker_el.style.left = `${String(rect.left)}px`;

    this.backdrop_el = document.createElement("div");
    this.backdrop_el.style.cssText =
      "position:fixed;inset:0;z-index:49;pointer-events:auto;";
    this.backdrop_el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.dismiss_picker();
    });

    document.body.appendChild(this.backdrop_el);
    document.body.appendChild(this.picker_el);
  }

  private dismiss_picker() {
    this.picker_el?.remove();
    this.backdrop_el?.remove();
    this.picker_el = null;
    this.backdrop_el = null;
  }

  update(updated: ProseNode): boolean {
    if (updated.type.name !== "code_block") return false;

    const new_lang = (updated.attrs.language as string) ?? "";
    const old_lang = this.current_language;

    if (new_lang === "mermaid" && old_lang !== "mermaid") {
      const pre = this.dom.querySelector("pre");
      if (pre) this.setup_mermaid(pre);
    } else if (new_lang !== "mermaid" && old_lang === "mermaid") {
      this.teardown_mermaid();
    }

    if (new_lang !== this.current_language) {
      this.current_language = new_lang;
      this.contentDOM.className = new_lang
        ? `language-${String(new_lang)}`
        : "";
      this.lang_label.textContent = find_language_label(new_lang);
    }

    if (this.mermaid?.is_preview) {
      const new_content = updated.textContent;
      if (new_content !== this.mermaid.last_rendered_content) {
        this.mermaid.last_rendered_content = new_content;
        this.schedule_mermaid_render();
      }
    }

    this.node = updated;
    return true;
  }

  stopEvent(event: Event): boolean {
    if (!(event.target instanceof HTMLElement)) return false;
    return event.target.closest(".code-block-toolbar") !== null;
  }

  ignoreMutation(mutation: ViewMutationRecord): boolean {
    if (!this.contentDOM.contains(mutation.target)) return true;
    return false;
  }

  destroy() {
    this.dismiss_picker();
    if (this.mermaid) {
      clearTimeout(this.mermaid.render_timer);
    }
  }
}

export const code_block_view_plugin_key = new PluginKey("code-block-view");

export function create_code_block_view_prose_plugin(): Plugin {
  return new Plugin({
    key: code_block_view_plugin_key,
    props: {
      nodeViews: {
        code_block: (node, view, get_pos) =>
          new CodeBlockView(node, view, get_pos),
      },
      handleDOMEvents: {
        keydown(view, event) {
          const { selection } = view.state;
          const $from = selection.$from;

          if ($from.parent.type.name !== "code_block") return false;

          const pos = $from.before($from.depth);
          const node = view.state.doc.nodeAt(pos);
          if (!node || node.type.name !== "code_block") return false;

          const code_block_end = pos + node.nodeSize - 1;
          const code_block_start = pos + 1;

          if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
            event.preventDefault();
            const tr = view.state.tr;
            const para = schema.nodes.paragraph.create();
            tr.insert(pos + node.nodeSize, para);
            tr.setSelection(
              TextSelection.create(tr.doc, pos + node.nodeSize + 1),
            );
            view.dispatch(tr);
            return true;
          }

          if (event.key === "ArrowDown" && selection.to === code_block_end) {
            event.preventDefault();
            const tr = view.state.tr;
            const para = schema.nodes.paragraph.create();
            tr.insert(pos + node.nodeSize, para);
            tr.setSelection(
              TextSelection.create(tr.doc, pos + node.nodeSize + 1),
            );
            view.dispatch(tr);
            return true;
          }

          if (event.key === "ArrowUp" && selection.from === code_block_start) {
            event.preventDefault();
            const tr = view.state.tr;
            const para = schema.nodes.paragraph.create();
            tr.insert(pos, para);
            tr.setSelection(TextSelection.create(tr.doc, pos + 1));
            view.dispatch(tr);
            return true;
          }

          return false;
        },
      },
    },
  });
}
