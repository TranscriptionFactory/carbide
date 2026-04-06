import {
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  create_cursor_anchor,
  position_suggest_dropdown,
  scroll_selected_into_view,
  attach_outside_dismiss,
  mount_dropdown,
  destroy_dropdown,
} from "./suggest_dropdown_utils";
import { fuzzy_score_fields } from "$lib/shared/utils/fuzzy_score";

export const slash_plugin_key = new PluginKey("slash-command");

type SlashState = {
  active: boolean;
  query: string;
  from: number;
  selected_index: number;
  filtered: SlashCommand[];
};

export type SlashCommand = {
  id: string;
  label: string;
  description: string;
  icon: string;
  keywords: string[];
  insert: (view: EditorView, slash_from: number) => void;
  is_available?: (state: EditorState) => boolean;
  source?: "builtin" | "plugin";
  plugin_name?: string;
};

export type SlashCommandConfig = {
  get_plugin_commands?: () => SlashCommand[];
};

const EMPTY_STATE: SlashState = {
  active: false,
  query: "",
  from: 0,
  selected_index: 0,
  filtered: [],
};

export function extract_slash_query_from_state(
  state: EditorState,
): { query: string; from: number } | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;
  if ($from.parent.type.name === "code_block") return null;
  if ($from.parent.type.name === "math_block") return null;
  for (let depth = $from.depth; depth >= 0; depth--) {
    if ($from.node(depth).type.name === "list_item") return null;
  }

  const text = $from.parent.textBetween(0, $from.parentOffset);
  const first_non_whitespace_index = text.search(/\S/);
  if (first_non_whitespace_index === -1) return null;
  if (text[first_non_whitespace_index] !== "/") return null;
  if ($from.parentOffset <= first_non_whitespace_index) return null;

  return {
    query: text.slice(first_non_whitespace_index + 1),
    from: $from.start(),
  };
}

function extract_slash_query(
  view: EditorView,
): { query: string; from: number } | null {
  return extract_slash_query_from_state(view.state);
}

export function filter_commands(
  all: SlashCommand[],
  query: string,
): SlashCommand[] {
  const normalized_query = query.trim();
  if (!normalized_query) return all;
  return all
    .map((cmd) => ({
      cmd,
      score: fuzzy_score_fields(normalized_query, [
        cmd.id,
        cmd.label,
        ...cmd.keywords,
      ]),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.cmd);
}

function make_heading_insert(level: number) {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const heading_type = state.schema.nodes["heading"];
    if (!heading_type) return;
    const cursor = state.selection.from;
    const tr = state.tr
      .delete(from, cursor)
      .setBlockType(from, from, heading_type, { level });
    view.dispatch(tr.scrollIntoView());
  };
}

function make_code_block_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const code_type = state.schema.nodes["code_block"];
    if (!code_type) return;
    const cursor = state.selection.from;
    const tr = state.tr
      .delete(from, cursor)
      .setBlockType(from, from, code_type, { language: "" });
    view.dispatch(tr.scrollIntoView());
  };
}

function make_blockquote_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const bq = state.schema.nodes["blockquote"];
    const para = state.schema.nodes["paragraph"];
    if (!bq || !para) return;

    const $pos = state.doc.resolve(from);
    const tr = state.tr.replaceWith(
      $pos.before(),
      $pos.after(),
      bq.create(null, para.create()),
    );
    const sel = TextSelection.findFrom(tr.doc.resolve($pos.before() + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_list_insert(list_type_name: string) {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const list = state.schema.nodes[list_type_name];
    const item = state.schema.nodes["list_item"];
    const para = state.schema.nodes["paragraph"];
    if (!list || !item || !para) return;

    const $pos = state.doc.resolve(from);
    const tr = state.tr.replaceWith(
      $pos.before(),
      $pos.after(),
      list.create(null, item.create(null, para.create())),
    );
    const sel = TextSelection.findFrom(tr.doc.resolve($pos.before() + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_todo_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const list = state.schema.nodes["bullet_list"];
    const item = state.schema.nodes["list_item"];
    const para = state.schema.nodes["paragraph"];
    if (!list || !item || !para) return;

    const item_spec_attrs = item.spec.attrs ?? {};
    const item_attrs = Object.prototype.hasOwnProperty.call(
      item_spec_attrs,
      "checked",
    )
      ? { checked: false }
      : null;

    const $pos = state.doc.resolve(from);
    const tr = state.tr.replaceWith(
      $pos.before(),
      $pos.after(),
      list.create(null, item.create(item_attrs, para.create())),
    );
    const sel = TextSelection.findFrom(tr.doc.resolve($pos.before() + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_table_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const { nodes: n } = state.schema;
    const table = n["table"];
    const row = n["table_row"];
    const header = n["table_header"];
    const cell = n["table_cell"];
    const para = n["paragraph"];
    if (!table || !row || !header || !cell || !para) return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const header_row = row.create(null, [
      header.create(null, para.create(null, state.schema.text("Col 1"))),
      header.create(null, para.create(null, state.schema.text("Col 2"))),
    ]);
    const body_row = row.create(null, [
      cell.create(null, para.create()),
      cell.create(null, para.create()),
    ]);

    const tr = state.tr.replaceWith(start, $pos.after(), [
      table.create(null, [header_row, body_row]),
      para.create(),
    ]);
    const sel = TextSelection.findFrom(tr.doc.resolve(start + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_math_block_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const math_type = state.schema.nodes["math_block"];
    const para = state.schema.nodes["paragraph"];
    if (!math_type || !para) return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const tr = state.tr.replaceWith(start, $pos.after(), [
      math_type.create({ value: "" }),
      para.create(),
    ]);
    const sel = TextSelection.findFrom(tr.doc.resolve(start + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_divider_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const hr = state.schema.nodes["hr"];
    const para = state.schema.nodes["paragraph"];
    if (!hr || !para) return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const tr = state.tr.replaceWith(start, $pos.after(), [
      hr.create(),
      para.create(),
    ]);
    const sel = TextSelection.findFrom(tr.doc.resolve(start + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_collapsible_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const details = state.schema.nodes["details_block"];
    const summary = state.schema.nodes["details_summary"];
    const content = state.schema.nodes["details_content"];
    const para = state.schema.nodes["paragraph"];
    if (!details || !summary || !content || !para) return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const tr = state.tr.replaceWith(start, $pos.after(), [
      details.create({ open: true }, [
        summary.create(null, state.schema.text("Details")),
        content.create(null, para.create()),
      ]),
      para.create(),
    ]);
    const sel = TextSelection.findFrom(tr.doc.resolve(start + 1), 1);
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

function make_frontmatter_insert() {
  return (view: EditorView, from: number) => {
    const { state } = view;
    const fm_type = state.schema.nodes["frontmatter"];
    const para = state.schema.nodes["paragraph"];
    if (!fm_type || !para) return;
    if (state.doc.firstChild?.type.name === "frontmatter") return;

    const $pos = state.doc.resolve(from);
    const start = $pos.before();

    const fm_node = fm_type.create(null);
    const tr = state.tr.replaceWith(start, $pos.after(), [
      fm_node,
      para.create(),
    ]);
    const sel = TextSelection.findFrom(
      tr.doc.resolve(start + fm_node.nodeSize + 1),
      1,
    );
    if (sel) tr.setSelection(sel);
    view.dispatch(tr.scrollIntoView());
  };
}

export function create_commands(): SlashCommand[] {
  return [
    {
      id: "h1",
      label: "Heading 1",
      description: "Large section heading",
      icon: "H1",
      keywords: ["heading", "h1", "title", "large"],
      insert: make_heading_insert(1),
    },
    {
      id: "h2",
      label: "Heading 2",
      description: "Medium section heading",
      icon: "H2",
      keywords: ["heading", "h2", "subtitle", "medium"],
      insert: make_heading_insert(2),
    },
    {
      id: "h3",
      label: "Heading 3",
      description: "Small section heading",
      icon: "H3",
      keywords: ["heading", "h3", "small"],
      insert: make_heading_insert(3),
    },
    {
      id: "h4",
      label: "Heading 4",
      description: "Sub-section heading",
      icon: "H4",
      keywords: ["heading", "h4"],
      insert: make_heading_insert(4),
    },
    {
      id: "h5",
      label: "Heading 5",
      description: "Minor heading",
      icon: "H5",
      keywords: ["heading", "h5"],
      insert: make_heading_insert(5),
    },
    {
      id: "h6",
      label: "Heading 6",
      description: "Minor heading",
      icon: "H6",
      keywords: ["heading", "h6"],
      insert: make_heading_insert(6),
    },
    {
      id: "code",
      label: "Code Block",
      description: "Code with syntax highlighting",
      icon: "</>",
      keywords: ["code", "block", "pre", "fence", "snippet", "syntax"],
      insert: make_code_block_insert(),
    },
    {
      id: "table",
      label: "Table",
      description: "Grid with rows and columns",
      icon: "⊞",
      keywords: ["table", "grid", "spreadsheet", "data"],
      insert: make_table_insert(),
    },
    {
      id: "bullet",
      label: "Bullet List",
      description: "Unordered list of items",
      icon: "•",
      keywords: ["bullet", "list", "unordered", "ul", "items"],
      insert: make_list_insert("bullet_list"),
    },
    {
      id: "ordered",
      label: "Ordered List",
      description: "Numbered list of items",
      icon: "#",
      keywords: ["ordered", "list", "numbered", "ol", "number"],
      insert: make_list_insert("ordered_list"),
    },
    {
      id: "todo",
      label: "Task List",
      description: "Checklist item with a checkbox",
      icon: "☐",
      keywords: ["task", "todo", "checkbox", "check", "list"],
      insert: make_todo_insert(),
    },
    {
      id: "blockquote",
      label: "Blockquote",
      description: "Indented quote or callout",
      icon: "❝",
      keywords: ["quote", "blockquote", "callout", "cite"],
      insert: make_blockquote_insert(),
    },
    {
      id: "divider",
      label: "Divider",
      description: "Horizontal rule to separate sections",
      icon: "—",
      keywords: ["divider", "hr", "horizontal", "rule", "separator", "line"],
      insert: make_divider_insert(),
    },
    {
      id: "math",
      label: "Math Block",
      description: "Block math equation using LaTeX",
      icon: "∑",
      keywords: ["math", "latex", "equation", "formula", "block", "katex"],
      insert: make_math_block_insert(),
    },
    {
      id: "collapsible",
      label: "Collapsible Section",
      description: "Foldable details/summary block",
      icon: "▸",
      keywords: [
        "collapse",
        "fold",
        "details",
        "summary",
        "toggle",
        "accordion",
      ],
      insert: make_collapsible_insert(),
    },
    {
      id: "frontmatter",
      label: "Properties",
      description: "Add note properties and frontmatter",
      icon: "🏷",
      keywords: ["frontmatter", "properties", "metadata", "yaml", "tags"],
      insert: make_frontmatter_insert(),
      is_available: (state) =>
        state.doc.firstChild?.type.name !== "frontmatter",
    },
  ];
}

function create_menu_el(): HTMLElement {
  const el = document.createElement("div");
  el.className = "SlashMenu";
  el.dataset.show = "false";
  return el;
}

function render_items(
  menu: HTMLElement,
  state: SlashState,
  on_click: (cmd: SlashCommand) => void,
): void {
  menu.innerHTML = "";
  if (state.filtered.length === 0) return;

  for (let i = 0; i < state.filtered.length; i++) {
    const cmd = state.filtered[i];
    if (!cmd) continue;

    const row = document.createElement("button");
    row.type = "button";
    row.className = "SlashMenu__item";
    if (i === state.selected_index)
      row.classList.add("SlashMenu__item--selected");

    const icon_el = document.createElement("span");
    icon_el.className = "SlashMenu__icon";
    icon_el.textContent = cmd.icon;
    row.appendChild(icon_el);

    const text_el = document.createElement("span");
    text_el.className = "SlashMenu__text";

    const label_el = document.createElement("span");
    label_el.className = "SlashMenu__label";
    label_el.textContent = cmd.label;
    text_el.appendChild(label_el);

    const desc_el = document.createElement("span");
    desc_el.className = "SlashMenu__desc";
    desc_el.textContent = cmd.description;
    text_el.appendChild(desc_el);

    if (cmd.source === "plugin" && cmd.plugin_name) {
      const badge_el = document.createElement("span");
      badge_el.className = "SlashMenu__badge";
      badge_el.textContent = cmd.plugin_name;
      text_el.appendChild(badge_el);
    }

    row.appendChild(text_el);

    row.addEventListener("mousedown", (e) => {
      e.preventDefault();
      on_click(cmd);
    });

    menu.appendChild(row);
  }
}

export function create_slash_command_prose_plugin(
  config?: SlashCommandConfig,
): Plugin {
  const builtin_commands = create_commands();

  let slash_state: SlashState = EMPTY_STATE;
  let menu: HTMLElement | null = null;
  let accept_fn: ((cmd: SlashCommand) => void) | null = null;
  let detach_dismiss: (() => void) | null = null;

  return new Plugin({
    key: slash_plugin_key,

    view(editor_view) {
      menu = create_menu_el();
      mount_dropdown(menu);

      accept_fn = (cmd) => {
        const from = slash_state.from;
        slash_state = EMPTY_STATE;
        if (menu) menu.style.display = "none";
        cmd.insert(editor_view, from);
        editor_view.focus();
      };

      detach_dismiss = attach_outside_dismiss(menu, editor_view.dom, () => {
        slash_state = EMPTY_STATE;
        if (menu) menu.style.display = "none";
      });

      return {
        update(view) {
          const result = extract_slash_query(view);

          if (!result) {
            if (slash_state.active) {
              slash_state = EMPTY_STATE;
              if (menu) menu.style.display = "none";
            }
            return;
          }

          const query = result.query.trim();
          const plugin_commands = config?.get_plugin_commands?.() ?? [];
          const all_commands = [...builtin_commands, ...plugin_commands];
          const available = all_commands.filter(
            (cmd) => !cmd.is_available || cmd.is_available(view.state),
          );
          const filtered = filter_commands(available, query);
          const prev_index = slash_state.selected_index;
          const prev_query = slash_state.query;

          slash_state = {
            active: true,
            query,
            from: result.from,
            selected_index:
              query !== prev_query
                ? 0
                : Math.min(prev_index, Math.max(0, filtered.length - 1)),
            filtered,
          };

          if (menu) render_items(menu, slash_state, (cmd) => accept_fn?.(cmd));

          if (menu && filtered.length > 0) {
            const anchor = create_cursor_anchor(view);
            menu.style.display = "block";
            position_suggest_dropdown(menu, anchor);
          } else if (menu) {
            menu.style.display = "none";
          }
        },

        destroy() {
          destroy_dropdown(menu, detach_dismiss);
          menu = null;
          detach_dismiss = null;
          accept_fn = null;
        },
      };
    },

    props: {
      handleKeyDown(_view, event) {
        if (!slash_state.active || slash_state.filtered.length === 0 || !menu) {
          return false;
        }

        if (event.key === "ArrowDown") {
          event.preventDefault();
          slash_state = {
            ...slash_state,
            selected_index:
              (slash_state.selected_index + 1) % slash_state.filtered.length,
          };
          render_items(menu, slash_state, (cmd) => accept_fn?.(cmd));
          scroll_selected_into_view(menu, slash_state.selected_index);
          return true;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          slash_state = {
            ...slash_state,
            selected_index:
              (slash_state.selected_index - 1 + slash_state.filtered.length) %
              slash_state.filtered.length,
          };
          render_items(menu, slash_state, (cmd) => accept_fn?.(cmd));
          scroll_selected_into_view(menu, slash_state.selected_index);
          return true;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const cmd = slash_state.filtered[slash_state.selected_index];
          if (cmd) accept_fn?.(cmd);
          return true;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          slash_state = EMPTY_STATE;
          if (menu) menu.style.display = "none";
          return true;
        }

        return false;
      },
    },
  });
}
