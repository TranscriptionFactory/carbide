import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { computePosition, flip, offset, shift } from "@floating-ui/dom";

export type DatePresetItem = {
  label: string;
  date_str: string;
  description: string;
};

type DateSuggestState = {
  active: boolean;
  from: number;
  query: string;
  selected_index: number;
  items: DatePresetItem[];
};

const EMPTY_STATE: DateSuggestState = {
  active: false,
  from: 0,
  query: "",
  selected_index: 0,
  items: [],
};

export const date_suggest_plugin_key = new PluginKey<DateSuggestState>(
  "date-suggest",
);

function format_date(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${String(y)}-${m}-${day}`;
}

export function generate_date_presets(now: Date): DatePresetItem[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  return [
    {
      label: "Today",
      date_str: format_date(today),
      description: "Today's date",
    },
    {
      label: "Tomorrow",
      date_str: format_date(tomorrow),
      description: "Tomorrow",
    },
    {
      label: "Yesterday",
      date_str: format_date(yesterday),
      description: "Yesterday",
    },
  ];
}

function filter_presets(
  items: DatePresetItem[],
  query: string,
): DatePresetItem[] {
  if (!query) return items;
  const q = query.toLowerCase();
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.date_str.includes(q) ||
      item.description.toLowerCase().includes(q),
  );
}

export function extract_date_trigger(
  state: EditorState,
): { query: string; from: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name === "code_block") return null;
  if ($from.parent.type.name === "math_block") return null;

  const text = $from.parent.textBetween(0, $from.parentOffset);
  const at_idx = text.lastIndexOf("@");
  if (at_idx === -1) return null;

  if (at_idx > 0) {
    const char_before = text[at_idx - 1];
    if (char_before && !/\s/.test(char_before)) return null;
  }

  const after_at = text.slice(at_idx + 1);
  if (after_at.includes(" ") || after_at.includes("@")) return null;

  return {
    query: after_at,
    from: $from.start() + at_idx,
  };
}

function create_menu_el(): HTMLElement {
  const el = document.createElement("div");
  el.className = "DateSuggestMenu";
  el.dataset.show = "false";
  return el;
}

function render_items(
  menu: HTMLElement,
  state: DateSuggestState,
  on_click: (item: DatePresetItem) => void,
): void {
  menu.innerHTML = "";
  if (state.items.length === 0) return;

  for (let i = 0; i < state.items.length; i++) {
    const item = state.items[i];
    if (!item) continue;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "DateSuggestMenu__item";
    if (i === state.selected_index) {
      row.classList.add("DateSuggestMenu__item--selected");
    }

    const label_el = document.createElement("span");
    label_el.className = "DateSuggestMenu__label";
    label_el.textContent = item.label;
    row.appendChild(label_el);

    const date_el = document.createElement("span");
    date_el.className = "DateSuggestMenu__date";
    date_el.textContent = item.date_str;
    row.appendChild(date_el);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_click(item);
    });

    menu.appendChild(row);
  }
}

function insert_date_link(
  view: EditorView,
  from: number,
  date_str: string,
): void {
  const { state } = view;
  const to = state.selection.from;
  const wiki_text = `[[${date_str}]]`;
  const tr = state.tr.replaceWith(from, to, state.schema.text(wiki_text));
  view.dispatch(tr);
}

function update_selected_class(
  menu: HTMLElement,
  prev: number,
  next: number,
): void {
  const children = menu.children;
  if (children[prev])
    children[prev].classList.remove("DateSuggestMenu__item--selected");
  if (children[next])
    children[next].classList.add("DateSuggestMenu__item--selected");
}

function create_virtual_element(view: EditorView): {
  getBoundingClientRect(): DOMRect;
} {
  return {
    getBoundingClientRect() {
      const { from } = view.state.selection;
      const coords = view.coordsAtPos(from);
      return new DOMRect(
        coords.left,
        coords.top,
        0,
        coords.bottom - coords.top,
      );
    },
  };
}

function show_menu(menu: HTMLElement, view: EditorView): void {
  if (!menu.parentElement) document.body.appendChild(menu);
  menu.dataset.show = "true";
  menu.style.display = "";
  menu.style.position = "fixed";
  menu.style.zIndex = "9999";
  const virtual = create_virtual_element(view);
  void computePosition(virtual as unknown as Element, menu, {
    placement: "bottom-start",
    middleware: [offset(6), flip(), shift()],
  }).then(({ x, y }) => {
    menu.style.left = `${String(x)}px`;
    menu.style.top = `${String(y)}px`;
  });
}

function hide_menu(menu: HTMLElement): void {
  menu.dataset.show = "false";
  menu.style.display = "none";
}

export function create_date_suggest_prose_plugin(): Plugin {
  let suggest_state: DateSuggestState = EMPTY_STATE;
  let menu: HTMLElement | null = null;
  let accept_fn: ((item: DatePresetItem) => void) | null = null;
  let detach_outside_click: (() => void) | null = null;
  let detach_focus_listener: (() => void) | null = null;
  let cached_presets: DatePresetItem[] | null = null;
  let cached_date_key = "";

  return new Plugin({
    key: date_suggest_plugin_key,

    view(editor_view) {
      menu = create_menu_el();
      hide_menu(menu);

      accept_fn = (item) => {
        const from = suggest_state.from;
        suggest_state = EMPTY_STATE;
        if (menu) hide_menu(menu);
        insert_date_link(editor_view, from, item.date_str);
        editor_view.focus();
      };

      const on_document_mousedown = (event: MouseEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (menu?.contains(target)) return;
        if (editor_view.dom.contains(target)) return;
        suggest_state = EMPTY_STATE;
        if (menu) hide_menu(menu);
      };

      const on_document_focusin = (event: FocusEvent) => {
        const target = event.target;
        if (!(target instanceof Node)) return;
        if (menu?.contains(target)) return;
        if (editor_view.dom.contains(target)) return;
        suggest_state = EMPTY_STATE;
        if (menu) hide_menu(menu);
      };

      document.addEventListener("mousedown", on_document_mousedown, true);
      document.addEventListener("focusin", on_document_focusin, true);

      detach_outside_click = () => {
        document.removeEventListener("mousedown", on_document_mousedown, true);
      };
      detach_focus_listener = () => {
        document.removeEventListener("focusin", on_document_focusin, true);
      };

      return {
        update(view) {
          const result = extract_date_trigger(view.state);

          if (!result) {
            if (suggest_state.active) {
              suggest_state = EMPTY_STATE;
              if (menu) hide_menu(menu);
            }
            return;
          }

          const query = result.query;
          const now = new Date();
          const date_key = now.toDateString();
          if (date_key !== cached_date_key || !cached_presets) {
            cached_presets = generate_date_presets(now);
            cached_date_key = date_key;
          }
          const filtered = filter_presets(cached_presets, query);
          const prev_index = suggest_state.selected_index;
          const prev_query = suggest_state.query;

          suggest_state = {
            active: true,
            query,
            from: result.from,
            selected_index:
              query !== prev_query
                ? 0
                : Math.min(prev_index, Math.max(0, filtered.length - 1)),
            items: filtered,
          };

          if (menu) {
            render_items(menu, suggest_state, (item) => accept_fn?.(item));
            if (filtered.length > 0 && view.hasFocus()) {
              show_menu(menu, view);
            } else {
              hide_menu(menu);
            }
          }
        },

        destroy() {
          menu?.remove();
          menu = null;
          accept_fn = null;
          detach_outside_click?.();
          detach_outside_click = null;
          detach_focus_listener?.();
          detach_focus_listener = null;
        },
      };
    },

    props: {
      handleKeyDown(_view, event) {
        if (
          !suggest_state.active ||
          suggest_state.items.length === 0 ||
          !menu
        ) {
          return false;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          const prev = suggest_state.selected_index;
          const next =
            (suggest_state.selected_index + 1) % suggest_state.items.length;
          suggest_state = { ...suggest_state, selected_index: next };
          if (menu) update_selected_class(menu, prev, next);
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          const prev = suggest_state.selected_index;
          const next =
            (suggest_state.selected_index - 1 + suggest_state.items.length) %
            suggest_state.items.length;
          suggest_state = { ...suggest_state, selected_index: next };
          if (menu) update_selected_class(menu, prev, next);
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const item = suggest_state.items[suggest_state.selected_index];
          if (item) accept_fn?.(item);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          suggest_state = EMPTY_STATE;
          hide_menu(menu);
          return true;
        }

        return false;
      },
    },
  });
}
