import { Plugin, PluginKey, TextSelection } from "prosemirror-state";
import type { Mark, MarkType, Node as ProseNode } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";
import { computePosition, flip, shift, offset } from "@floating-ui/dom";
import { Check, Link, Pencil, Trash2 } from "lucide-static";
import { build_link_edit_transaction } from "./link_edit_transaction";
import { render_lsp_markdown } from "./lsp_tooltip_renderer";
import { line_and_character_from_pos } from "./lsp_plugin_utils";

export const link_tooltip_plugin_key = new PluginKey("custom-link-tooltip");

let _link_tooltip_active = false;
export function is_link_tooltip_active(): boolean {
  return _link_tooltip_active;
}

function resize_icon(svg: string, size: number): string {
  return svg
    .replace(/width="24"/, `width="${String(size)}"`)
    .replace(/height="24"/, `height="${String(size)}"`);
}

const ICONS = {
  link: resize_icon(Link, 16),
  edit: resize_icon(Pencil, 14),
  trash: resize_icon(Trash2, 14),
  check: resize_icon(Check, 14),
} as const;

interface LinkInfo {
  mark: Mark;
  from: number;
  to: number;
  display_text: string;
}

function pos_to_dom_rect(view: EditorView, from: number, to: number): DOMRect {
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  const top = Math.min(start.top, end.top);
  const bottom = Math.max(start.bottom, end.bottom);
  const left = Math.min(start.left, end.left);
  const right = Math.max(start.right, end.right);
  return new DOMRect(left, top, right - left, bottom - top);
}

function find_link_at_event(
  view: EditorView,
  event: MouseEvent,
  link_type: MarkType,
): LinkInfo | null {
  const coords = view.posAtCoords({
    left: event.clientX,
    top: event.clientY,
  });
  if (!coords) return null;

  const { pos } = coords;
  const node = view.state.doc.nodeAt(pos);
  if (!node) return null;

  const mark = node.marks.find((m) => m.type === link_type);
  if (!mark) return null;

  const resolved = view.state.doc.resolve(pos);
  const parent = resolved.parent;
  const parent_offset = resolved.before();

  let start = -1;
  let end = -1;
  let display_text = "";

  parent.descendants((child: ProseNode, child_pos: number) => {
    if (start > -1) return false;
    if (child.isText && mark.isInSet(child.marks)) {
      start = parent_offset + 1 + child_pos;
      end = start + child.nodeSize;
      display_text = child.text ?? "";
    }
    return undefined;
  });

  if (start === -1) return null;

  return { mark, from: start, to: end, display_text };
}

function create_icon_button(
  icon_html: string,
  css_class: string,
  on_click: (e: Event) => void,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `button ${css_class}`;
  btn.innerHTML = icon_html;
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    on_click(e);
  });
  return btn;
}

function build_preview_dom(callbacks: {
  on_copy: () => void;
  on_edit: () => void;
  on_remove: () => void;
}): {
  root: HTMLDivElement;
  link_display_el: HTMLSpanElement;
} {
  const root = document.createElement("div");
  root.className = "link-preview";

  root.appendChild(
    create_icon_button(ICONS.link, "link-icon", callbacks.on_copy),
  );

  const link_display_el = document.createElement("span");
  link_display_el.className = "link-display";
  root.appendChild(link_display_el);

  root.appendChild(
    create_icon_button(ICONS.edit, "link-edit-button", callbacks.on_edit),
  );
  root.appendChild(
    create_icon_button(ICONS.trash, "link-remove-button", callbacks.on_remove),
  );

  return { root, link_display_el };
}

function build_edit_dom(callbacks: {
  on_confirm: () => void;
  on_cancel: () => void;
}): {
  root: HTMLDivElement;
  text_input: HTMLInputElement;
  link_input: HTMLInputElement;
} {
  const root = document.createElement("div");
  root.className = "link-edit";

  const text_row = document.createElement("div");
  text_row.className = "link-edit-field-row";
  const text_label = document.createElement("span");
  text_label.className = "link-edit-field-label";
  text_label.textContent = "Text";
  const text_input = document.createElement("input");
  text_input.className = "input-area";
  text_input.placeholder = "Display text...";
  text_row.appendChild(text_label);
  text_row.appendChild(text_input);
  root.appendChild(text_row);

  const separator = document.createElement("div");
  separator.className = "link-edit-separator";
  root.appendChild(separator);

  const link_row = document.createElement("div");
  link_row.className = "link-edit-field-row";
  const link_label = document.createElement("span");
  link_label.className = "link-edit-field-label";
  link_label.textContent = "Link";
  const link_input = document.createElement("input");
  link_input.className = "input-area";
  link_input.placeholder = "URL or path...";
  link_row.appendChild(link_label);
  link_row.appendChild(link_input);

  const confirm_btn = create_icon_button(
    ICONS.check,
    "confirm",
    callbacks.on_confirm,
  );
  link_row.appendChild(confirm_btn);
  root.appendChild(link_row);

  const on_keydown = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      callbacks.on_confirm();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      callbacks.on_cancel();
    }
  };
  text_input.addEventListener("keydown", on_keydown);
  link_input.addEventListener("keydown", on_keydown);

  return { root, text_input, link_input };
}

function show_floating(
  container: HTMLElement,
  reference: { getBoundingClientRect: () => DOMRect },
) {
  container.style.display = "block";
  container.style.position = "fixed";
  container.style.zIndex = "9999";

  const virtual_el = {
    getBoundingClientRect: reference.getBoundingClientRect,
  };

  void computePosition(virtual_el as Element, container, {
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
  }).then(({ x, y }) => {
    container.style.left = `${String(x)}px`;
    container.style.top = `${String(y)}px`;
  });
}

function hide_floating(container: HTMLElement) {
  container.style.display = "none";
}

function render_lsp_section(container: HTMLElement, content: string) {
  const existing = container.querySelector(".lsp-hover-section");
  if (existing) existing.remove();
  const section = document.createElement("div");
  section.className = "lsp-hover-section";
  section.style.borderTop = "1px solid var(--border)";
  section.style.marginTop = "6px";
  section.style.paddingTop = "6px";
  section.style.fontSize = "13px";
  section.style.lineHeight = "1.5";
  const header = document.createElement("span");
  header.style.fontSize = "10px";
  header.style.textTransform = "uppercase";
  header.style.letterSpacing = "0.05em";
  header.style.color = "var(--muted-foreground)";
  header.style.display = "block";
  header.style.marginBottom = "4px";
  header.textContent = "LSP";
  section.appendChild(header);
  const body = document.createElement("div");
  body.className = "lsp-hover-content";
  body.innerHTML = render_lsp_markdown(content);
  section.appendChild(body);
  const actions = container.querySelector(".link-preview");
  if (actions) {
    container.insertBefore(section, actions);
  } else {
    container.appendChild(section);
  }
}

export function create_link_tooltip_prose_plugin(
  link_type: MarkType,
  options?: {
    get_lsp_hover?: (line: number, character: number) => Promise<string | null>;
    get_markdown?: () => string;
  },
): Plugin {
  return new Plugin({
    key: link_tooltip_plugin_key,
    view(editor_view) {
      let mode: "idle" | "preview" | "edit" = "idle";
      let current_link: LinkInfo | null = null;
      let hovering_tooltip = false;

      const preview_container = document.createElement("div");
      preview_container.className = "milkdown-link-preview";
      preview_container.style.display = "none";
      document.body.appendChild(preview_container);

      const edit_container = document.createElement("div");
      edit_container.className = "milkdown-link-edit";
      edit_container.style.display = "none";
      document.body.appendChild(edit_container);

      const enter_edit_mode = () => {
        if (!current_link) return;
        mode = "edit";

        edit_dom.text_input.value = current_link.display_text;
        edit_dom.link_input.value = String(current_link.mark.attrs.href ?? "");

        const edit_from = current_link.from;
        const edit_to = current_link.to;

        hide_floating(preview_container);
        show_floating(edit_container, {
          getBoundingClientRect: () =>
            pos_to_dom_rect(editor_view, edit_from, edit_to),
        });

        requestAnimationFrame(() => {
          edit_dom.text_input.focus();
          edit_dom.text_input.select();
        });
      };

      const confirm_edit = () => {
        if (!current_link) {
          reset();
          return;
        }

        const new_href = edit_dom.link_input.value.trim();
        const raw_text = edit_dom.text_input.value.trim();

        if (!raw_text && !new_href) {
          reset();
          return;
        }

        const new_text = raw_text || new_href;
        const { from, to, mark } = current_link;
        const old_href = (mark.attrs.href as string) ?? "";

        const { state } = editor_view;

        const tr = build_link_edit_transaction(state, link_type, {
          from,
          to,
          old_display_text: current_link.display_text,
          old_href,
          new_display_text: new_text,
          new_href,
        });

        if (tr) editor_view.dispatch(tr);
        reset();
      };

      const remove_link = () => {
        if (!current_link) return;
        const { from, to } = current_link;
        const { state } = editor_view;
        const tr = state.tr;
        tr.removeMark(from, to, link_type);
        editor_view.dispatch(tr);
        reset();
      };

      const reset = () => {
        mode = "idle";
        current_link = null;
        hovering_tooltip = false;
        _link_tooltip_active = false;
        hide_floating(preview_container);
        hide_floating(edit_container);
      };

      const copy_link = () => {
        if (!current_link) return;
        const href = String(current_link.mark.attrs.href ?? "");
        if (href) void navigator.clipboard.writeText(href).catch(() => {});
      };

      const preview_dom = build_preview_dom({
        on_copy: copy_link,
        on_edit: enter_edit_mode,
        on_remove: remove_link,
      });
      preview_container.appendChild(preview_dom.root);

      const edit_dom = build_edit_dom({
        on_confirm: confirm_edit,
        on_cancel: reset,
      });
      edit_container.appendChild(edit_dom.root);

      edit_container.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          requestAnimationFrame(() => {
            editor_view.dom.focus({ preventScroll: true });
          });
        }
      });

      preview_container.addEventListener("mouseenter", () => {
        hovering_tooltip = true;
      });
      preview_container.addEventListener("mouseleave", () => {
        hovering_tooltip = false;
      });

      const HOVER_DELAY = 50;
      let hover_timer: ReturnType<typeof setTimeout> | null = null;

      function schedule_hover(fn: () => void) {
        if (hover_timer !== null) clearTimeout(hover_timer);
        hover_timer = setTimeout(() => {
          hover_timer = null;
          fn();
        }, HOVER_DELAY);
      }

      const on_mousemove = (event: MouseEvent) => {
        if (mode === "edit") return;
        if (!editor_view.hasFocus()) return;

        schedule_hover(() => {
          const info = find_link_at_event(editor_view, event, link_type);
          if (info) {
            current_link = info;
            mode = "preview";
            _link_tooltip_active = true;
            preview_dom.link_display_el.textContent = String(
              info.mark.attrs.href ?? "",
            );
            const lsp_section =
              preview_container.querySelector(".lsp-hover-section");
            if (lsp_section) lsp_section.remove();
            show_floating(preview_container, {
              getBoundingClientRect: () =>
                pos_to_dom_rect(editor_view, info.from, info.to),
            });
            if (options?.get_lsp_hover && options.get_markdown) {
              const markdown = options.get_markdown();
              const { line, character } = line_and_character_from_pos(
                editor_view,
                info.from,
                markdown,
              );
              void options.get_lsp_hover(line, character).then((content) => {
                if (mode !== "preview" || !current_link) return;
                if (!content) return;
                render_lsp_section(preview_container, content);
              });
            }
          } else if (!hovering_tooltip && mode === "preview") {
            reset();
          }
        });
      };

      const on_mouseleave = () => {
        if (mode === "edit") return;
        schedule_hover(() => {
          if (!hovering_tooltip && mode === "preview") reset();
        });
      };

      editor_view.dom.addEventListener("mousemove", on_mousemove);
      editor_view.dom.addEventListener("mouseleave", on_mouseleave);

      return {
        update(view: EditorView) {
          if (mode !== "edit") return;
          if (!current_link) return;

          const { state } = view;
          const { selection } = state;
          if (!(selection instanceof TextSelection)) return;
          const { from, to } = selection;
          if (from === current_link.from && to === current_link.to) return;

          reset();
        },
        destroy() {
          if (hover_timer !== null) {
            clearTimeout(hover_timer);
            hover_timer = null;
          }
          editor_view.dom.removeEventListener("mousemove", on_mousemove);
          editor_view.dom.removeEventListener("mouseleave", on_mouseleave);
          preview_container.remove();
          edit_container.remove();
        },
      };
    },
  });
}
