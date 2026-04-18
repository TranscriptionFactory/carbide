import { Plugin, PluginKey } from "prosemirror-state";
import type { EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";
import type {
  AtPaletteCategory,
  AtPaletteItem,
  AtPaletteDateItem,
  AtPaletteCommandItem,
} from "./at_palette_types";
import {
  parse_natural_date,
  format_date,
  generate_date_presets,
} from "../domain/parse_natural_date";

type AtPaletteState = {
  active: boolean;
  from: number;
  query: string;
  selected_index: number;
  items_by_category: Partial<Record<AtPaletteCategory, AtPaletteItem[]>>;
};

const EMPTY_STATE: AtPaletteState = {
  active: false,
  from: 0,
  query: "",
  selected_index: 0,
  items_by_category: {},
};

export const at_palette_plugin_key = new PluginKey<AtPaletteState>(
  "at-palette",
);

const MAX_QUERY_LENGTH = 40;

const view_updaters = new WeakMap<
  EditorView,
  (category: AtPaletteCategory, items: AtPaletteItem[]) => void
>();

export function extract_at_trigger(
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
  if (after_at.includes("@") || after_at.includes("\n")) return null;
  if (after_at.length > MAX_QUERY_LENGTH) return null;

  return {
    query: after_at,
    from: $from.start() + at_idx,
  };
}

type DetectedPrefix = {
  category: AtPaletteCategory | "all";
  stripped_query: string;
};

export function detect_prefix(query: string): DetectedPrefix {
  if (query.startsWith("/"))
    return { category: "notes", stripped_query: query.slice(1) };
  if (query.startsWith("#"))
    return { category: "headings", stripped_query: query.slice(1) };
  if (query.startsWith("["))
    return { category: "references", stripped_query: query.slice(1) };
  if (query.startsWith(">"))
    return { category: "commands", stripped_query: query.slice(1) };
  if (query.startsWith("d "))
    return { category: "dates", stripped_query: query.slice(2) };
  if (query.startsWith("t "))
    return { category: "tags", stripped_query: query.slice(2) };
  return { category: "all", stripped_query: query };
}

const CATEGORY_ORDER: AtPaletteCategory[] = [
  "dates",
  "notes",
  "headings",
  "tags",
  "references",
  "commands",
];

const CATEGORY_LABELS: Record<AtPaletteCategory, string> = {
  dates: "Dates",
  notes: "Notes",
  headings: "Headings",
  tags: "Tags",
  references: "References",
  commands: "Commands",
};

function flatten_items(
  items_by_category: Partial<Record<AtPaletteCategory, AtPaletteItem[]>>,
): AtPaletteItem[] {
  const flat: AtPaletteItem[] = [];
  for (const cat of CATEGORY_ORDER) {
    const items = items_by_category[cat];
    if (items && items.length > 0) flat.push(...items);
  }
  return flat;
}

function resolve_date_items(query: string): AtPaletteDateItem[] {
  const now = new Date();
  const items: AtPaletteDateItem[] = [];

  if (!query) {
    const presets = generate_date_presets(now);
    for (const p of presets) {
      items.push({ category: "dates", ...p });
    }
    return items;
  }

  const parsed = parse_natural_date(query, now);
  if (parsed) {
    items.push({
      category: "dates",
      label: parsed.label,
      date_str: format_date(parsed.date),
      description: format_date(parsed.date),
    });
  }

  const presets = generate_date_presets(now);
  const q_lower = query.toLowerCase();
  for (const p of presets) {
    if (
      p.label.toLowerCase().includes(q_lower) ||
      p.date_str.includes(q_lower)
    ) {
      if (!items.some((i) => i.date_str === p.date_str)) {
        items.push({ category: "dates", ...p });
      }
    }
  }

  return items;
}

function resolve_command_items(
  query: string,
  get_commands: () => AtPaletteCommandItem[],
): AtPaletteCommandItem[] {
  const all = get_commands();
  if (!query) return all.slice(0, 10);
  const q = query.toLowerCase();
  return all
    .filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        cmd.description.toLowerCase().includes(q),
    )
    .slice(0, 10);
}

export type AtPalettePluginConfig = {
  on_note_query?: ((query: string) => void) | undefined;
  on_heading_query?:
    | ((note_name: string | null, heading_query: string) => void)
    | undefined;
  on_tag_query?: ((query: string) => void) | undefined;
  on_cite_query?: ((query: string) => void) | undefined;
  on_cite_accept?: ((citekey: string) => void) | undefined;
  on_command_execute?: ((command_id: string) => void) | undefined;
  get_commands: () => AtPaletteCommandItem[];
};

function create_dropdown_el(): HTMLElement {
  const el = document.createElement("div");
  el.className = "AtPalette";
  return el;
}

function item_display_text(item: AtPaletteItem): string {
  switch (item.category) {
    case "notes":
      return item.title;
    case "headings":
      return item.text;
    case "dates":
      return item.label;
    case "references":
      return item.title || item.citekey;
    case "tags":
      return item.tag;
    case "commands":
      return item.label;
  }
}

function item_secondary_text(item: AtPaletteItem): string | null {
  switch (item.category) {
    case "notes":
      return item.path;
    case "headings":
      return item.note_path;
    case "dates":
      return item.date_str;
    case "references":
      return item.authors ? `${item.authors} (${item.year})` : item.year;
    case "tags":
      return `${String(item.count)} notes`;
    case "commands":
      return item.description;
  }
}

function render_dropdown(
  dropdown: HTMLElement,
  flat_items: AtPaletteItem[],
  selected_index: number,
  on_select: (index: number) => void,
) {
  dropdown.innerHTML = "";
  if (flat_items.length === 0) return;

  let current_category: AtPaletteCategory | null = null;
  for (let i = 0; i < flat_items.length; i++) {
    const item = flat_items[i]!;

    if (item.category !== current_category) {
      current_category = item.category;
      const header = document.createElement("div");
      header.className = "AtPalette__section-header";
      header.textContent = CATEGORY_LABELS[current_category];
      dropdown.appendChild(header);
    }

    const row = document.createElement("button");
    row.type = "button";
    row.className = "AtPalette__item";
    if (i === selected_index) row.classList.add("AtPalette__item--selected");

    const label = document.createElement("span");
    label.className = "AtPalette__label";
    label.textContent = item_display_text(item);
    row.appendChild(label);

    const secondary = item_secondary_text(item);
    if (secondary) {
      const badge = document.createElement("span");
      badge.className = "AtPalette__secondary";
      badge.textContent = secondary;
      row.appendChild(badge);
    }

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_select(i);
    });
    dropdown.appendChild(row);
  }
}

function insert_for_item(
  view: EditorView,
  from: number,
  item: AtPaletteItem,
  config: AtPalettePluginConfig,
): void {
  const { state } = view;
  const to = state.selection.from;

  let text: string | null = null;
  switch (item.category) {
    case "notes":
      text = `[[${item.path}]]`;
      break;
    case "headings":
      text = `[[${item.note_path}#${item.text}]]`;
      break;
    case "dates":
      text = `[[${item.date_str}]]`;
      break;
    case "references":
      text = `[@${item.citekey}]`;
      config.on_cite_accept?.(item.citekey);
      break;
    case "tags":
      text = `#${item.tag}`;
      break;
    case "commands":
      text = null;
      break;
  }

  if (text !== null) {
    const tr = state.tr.replaceWith(from, to, state.schema.text(text));
    view.dispatch(tr);
  } else if (item.category === "commands") {
    const tr = state.tr.delete(from, to);
    view.dispatch(tr);
    config.on_command_execute?.(item.id);
  }
}

export function create_at_palette_prose_plugin(
  config: AtPalettePluginConfig,
): Plugin {
  let palette_state: AtPaletteState = EMPTY_STATE;
  let dropdown: HTMLElement | null = null;
  let is_visible = false;
  let debounce_timer: ReturnType<typeof setTimeout> | null = null;
  let suppress_next_activation = false;
  let detach_dismiss: (() => void) | null = null;
  let current_view: EditorView | null = null;

  function get_flat_items(): AtPaletteItem[] {
    return flatten_items(palette_state.items_by_category);
  }

  function show_dropdown(view: EditorView) {
    if (!dropdown) return;
    const anchor = create_cursor_anchor(view);
    dropdown.style.display = "block";
    is_visible = true;
    position_suggest_dropdown(dropdown, anchor);
  }

  function hide_dropdown() {
    if (!dropdown) return;
    dropdown.style.display = "none";
    is_visible = false;
  }

  function dismiss() {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;
    palette_state = EMPTY_STATE;
    hide_dropdown();
    if (current_view) {
      current_view.dispatch(
        current_view.state.tr.setMeta(at_palette_plugin_key, EMPTY_STATE),
      );
    }
  }

  function accept(view: EditorView, index: number) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = null;

    const items = get_flat_items();
    const item = items[index];
    if (!item) return;

    const from = palette_state.from;
    palette_state = EMPTY_STATE;
    hide_dropdown();
    insert_for_item(view, from, item, config);
    view.focus();
    suppress_next_activation = true;
  }

  function sync(view: EditorView) {
    if (!dropdown) return;
    const items = get_flat_items();

    if (!palette_state.active || items.length === 0) {
      hide_dropdown();
      return;
    }

    render_dropdown(dropdown, items, palette_state.selected_index, (i) => {
      accept(view, i);
    });

    scroll_selected_into_view(dropdown, palette_state.selected_index);

    if (!is_visible || palette_state.active) {
      show_dropdown(view);
    }
  }

  function fire_async_queries(query: string, prefix: DetectedPrefix) {
    if (debounce_timer) clearTimeout(debounce_timer);
    debounce_timer = setTimeout(() => {
      const cat = prefix.category;
      const sq = prefix.stripped_query;
      if (cat === "all" || cat === "notes") config.on_note_query?.(sq || query);
      if (cat === "all" || cat === "headings")
        config.on_heading_query?.(null, sq || query);
      if (cat === "all" || cat === "tags") config.on_tag_query?.(sq || query);
      if (cat === "all" || cat === "references")
        config.on_cite_query?.(sq || query);
    }, 50);
  }

  function handle_set_category(
    category: AtPaletteCategory,
    items: AtPaletteItem[],
  ) {
    if (!palette_state.active || !current_view) return;
    palette_state = {
      ...palette_state,
      items_by_category: {
        ...palette_state.items_by_category,
        [category]: items,
      },
      selected_index: 0,
    };
    sync(current_view);
  }

  return new Plugin({
    key: at_palette_plugin_key,

    state: {
      init: () => EMPTY_STATE,
      apply(tr, prev) {
        const meta = tr.getMeta(at_palette_plugin_key) as
          | AtPaletteState
          | undefined;
        if (meta) return meta;
        return prev;
      },
    },

    view(editor_view) {
      current_view = editor_view;
      dropdown = create_dropdown_el();
      mount_dropdown(dropdown);
      detach_dismiss = attach_outside_dismiss(dropdown, editor_view.dom, () =>
        dismiss(),
      );
      view_updaters.set(editor_view, handle_set_category);

      return {
        update(view) {
          current_view = view;
          const result = extract_at_trigger(view.state);

          if (!result) {
            if (palette_state.active) dismiss();
            return;
          }

          if (suppress_next_activation) {
            suppress_next_activation = false;
            return;
          }

          const query = result.query;
          const prev_query = palette_state.query;
          const was_active = palette_state.active;
          const prefix = detect_prefix(query);

          const date_items =
            prefix.category === "all" || prefix.category === "dates"
              ? resolve_date_items(prefix.stripped_query)
              : [];

          const command_items =
            prefix.category === "all" || prefix.category === "commands"
              ? resolve_command_items(
                  prefix.stripped_query,
                  config.get_commands,
                )
              : [];

          const next_by_category = { ...palette_state.items_by_category };
          next_by_category.dates = date_items;
          next_by_category.commands = command_items;

          if (prefix.category !== "all") {
            for (const cat of CATEGORY_ORDER) {
              if (
                cat !== prefix.category &&
                cat !== "dates" &&
                cat !== "commands"
              ) {
                next_by_category[cat] = [];
              }
            }
          }

          const all_items = flatten_items(next_by_category);

          palette_state = {
            active: true,
            query,
            from: result.from,
            selected_index:
              query !== prev_query
                ? 0
                : Math.min(
                    palette_state.selected_index,
                    Math.max(0, all_items.length - 1),
                  ),
            items_by_category: next_by_category,
          };

          if (!was_active) {
            view.dispatch(
              view.state.tr.setMeta(at_palette_plugin_key, palette_state),
            );
          }

          if (query !== prev_query || !was_active) {
            fire_async_queries(query, prefix);
          }

          sync(view);
        },

        destroy() {
          if (current_view) view_updaters.delete(current_view);
          destroy_dropdown(dropdown, detach_dismiss);
          dropdown = null;
          detach_dismiss = null;
          current_view = null;
          is_visible = false;
          if (debounce_timer) clearTimeout(debounce_timer);
          debounce_timer = null;
        },
      };
    },

    props: {
      handleKeyDown(view, event) {
        if (!palette_state.active) return false;

        const items = get_flat_items();
        if (items.length === 0) return false;

        if (event.key === "ArrowDown") {
          event.preventDefault();
          event.stopPropagation();
          palette_state = {
            ...palette_state,
            selected_index: (palette_state.selected_index + 1) % items.length,
          };
          sync(view);
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          event.stopPropagation();
          palette_state = {
            ...palette_state,
            selected_index:
              (palette_state.selected_index - 1 + items.length) % items.length,
          };
          sync(view);
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          event.stopPropagation();
          accept(view, palette_state.selected_index);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
          return true;
        }

        return false;
      },
    },
  });
}

export function set_at_palette_suggestions(
  view: EditorView,
  category: AtPaletteCategory,
  items: AtPaletteItem[],
): void {
  const updater = view_updaters.get(view);
  updater?.(category, items);
}
