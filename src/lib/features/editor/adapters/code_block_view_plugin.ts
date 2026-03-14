import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { Node as ProseNode } from "@milkdown/kit/prose/model";
import type { EditorView, NodeView } from "@milkdown/kit/prose/view";
import { Check, Copy } from "lucide-static";
import { find_language_label, search_languages } from "./language_registry";
import { LruCache } from "$lib/shared/utils/lru_cache";

const mermaid_svg_cache = new LruCache<string, string>(128);

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
    mermaid.default.initialize({
      startOnLoad: false,
      theme,
      securityLevel: "loose",
    });

    const id = `mermaid-${String(Date.now())}`;
    const { svg } = await mermaid.default.render(id, code);
    mermaid_svg_cache.set(key, svg);
    container.innerHTML = svg;
  } catch {
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
    toggle_btn.textContent = "Preview";
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
      const code = this.contentDOM.textContent ?? "";
      void render_mermaid_preview(code, this.mermaid.preview_container);
    }, 150);
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

    this.backdrop_el = document.createElement("div");
    this.backdrop_el.style.cssText =
      "position:fixed;inset:0;z-index:49;pointer-events:auto;";
    this.backdrop_el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      this.dismiss_picker();
    });

    document.body.appendChild(this.backdrop_el);
    this.dom.appendChild(this.picker_el);
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
    if (new_lang !== this.current_language) {
      this.current_language = new_lang;
      this.contentDOM.className = new_lang
        ? `language-${String(new_lang)}`
        : "";
      this.lang_label.textContent = find_language_label(new_lang);
    }

    if (this.mermaid?.is_preview) {
      this.schedule_mermaid_render();
    }

    this.node = updated;
    return true;
  }

  stopEvent(event: Event): boolean {
    if (!(event.target instanceof HTMLElement)) return false;
    return (
      event.target.closest(".code-block-copy") !== null ||
      event.target.closest(".code-lang-label") !== null ||
      event.target.closest(".code-lang-picker") !== null ||
      event.target.closest(".mermaid-toggle-btn") !== null
    );
  }

  destroy() {
    this.dismiss_picker();
    if (this.mermaid) {
      clearTimeout(this.mermaid.render_timer);
    }
  }
}

export const code_block_view_plugin_key = new PluginKey("code-block-view");

export const code_block_view_plugin = $prose(
  () =>
    new Plugin({
      key: code_block_view_plugin_key,
      props: {
        nodeViews: {
          code_block: (node, view, get_pos) =>
            new CodeBlockView(node, view, get_pos),
        },
      },
    }),
);
