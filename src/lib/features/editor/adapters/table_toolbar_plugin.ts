import { $prose } from "@milkdown/kit/utils";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import type { ResolvedPos } from "@milkdown/kit/prose/model";
import {
  addColumnAfter,
  addColumnBefore,
  addRowAfter,
  addRowBefore,
  deleteColumn,
  deleteRow,
  findTable,
  TableMap,
  selectionCell,
} from "@milkdown/kit/prose/tables";
import {
  compute_floating_position,
  create_backdrop,
  Z_TABLE_TOOLBAR,
} from "./floating_toolbar_utils";

export type ColumnAlignment = "left" | "center" | "right";

function is_in_table(pos: ResolvedPos): boolean {
  for (let d = pos.depth; d > 0; d--) {
    const node = pos.node(d);
    if (
      node.type.name === "table_cell" ||
      node.type.name === "table_header" ||
      node.type.name === "table"
    ) {
      return true;
    }
  }
  return false;
}

function find_table_dom(view: EditorView): HTMLTableElement | null {
  const { $from } = view.state.selection;
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type.name === "table") {
      const dom = view.nodeDOM($from.before(d));
      if (dom instanceof HTMLTableElement) return dom;
      if (dom instanceof HTMLElement) {
        const table = dom.querySelector("table");
        if (table) return table;
      }
      return null;
    }
  }
  return null;
}

export function get_current_column_alignment(
  view: EditorView,
): ColumnAlignment {
  const { state } = view;
  try {
    const $cell = selectionCell(state);
    const alignment = $cell.nodeAfter?.attrs["alignment"];
    if (alignment === "center" || alignment === "right") return alignment;
  } catch {
    // not in a table cell
  }
  return "left";
}

export function align_column(
  view: EditorView,
  alignment: ColumnAlignment,
): void {
  const { state } = view;
  const table_info = findTable(state.selection.$from);
  if (!table_info) return;

  const map = TableMap.get(table_info.node);
  try {
    const $cell = selectionCell(state);
    const cell_pos = $cell.pos - table_info.start;
    const col = map.colCount(cell_pos);
    const col_cells = map.cellsInRect({
      left: col,
      right: col + 1,
      top: 0,
      bottom: map.height,
    });

    const tr = state.tr;
    for (const cell_offset of col_cells) {
      const node = table_info.node.nodeAt(cell_offset);
      if (!node) continue;
      const abs_pos = table_info.start + cell_offset;
      tr.setNodeMarkup(abs_pos, undefined, {
        ...node.attrs,
        alignment,
      });
    }
    view.dispatch(tr);
  } catch {
    // cursor not in a valid cell position
  }
}

type ToolbarButton = {
  label: string;
  icon: string;
  action: (view: EditorView) => void;
  danger?: boolean;
};

const SEPARATOR = "---";

function toolbar_config(): Array<ToolbarButton | typeof SEPARATOR> {
  return [
    {
      label: "Add row above",
      icon: "↑+",
      action: (view) => addRowBefore(view.state, view.dispatch),
    },
    {
      label: "Add row below",
      icon: "↓+",
      action: (view) => addRowAfter(view.state, view.dispatch),
    },
    SEPARATOR,
    {
      label: "Add column before",
      icon: "←+",
      action: (view) => addColumnBefore(view.state, view.dispatch),
    },
    {
      label: "Add column after",
      icon: "→+",
      action: (view) => addColumnAfter(view.state, view.dispatch),
    },
    SEPARATOR,
    {
      label: "Delete row",
      icon: "↑✕",
      action: (view) => deleteRow(view.state, view.dispatch),
      danger: true,
    },
    {
      label: "Delete column",
      icon: "←✕",
      action: (view) => deleteColumn(view.state, view.dispatch),
      danger: true,
    },
  ];
}

const ALIGNMENTS: Array<{ label: string; icon: string; value: ColumnAlignment }> =
  [
    { label: "Align left", icon: "⫷", value: "left" },
    { label: "Align center", icon: "⊟", value: "center" },
    { label: "Align right", icon: "⫸", value: "right" },
  ];

type AlignmentButtonRefs = Map<ColumnAlignment, HTMLButtonElement>;

function create_toolbar_dom(
  view: EditorView,
): { el: HTMLElement; align_btns: AlignmentButtonRefs } {
  const toolbar = document.createElement("div");
  toolbar.className = "table-toolbar";
  toolbar.contentEditable = "false";

  for (const item of toolbar_config()) {
    if (item === SEPARATOR) {
      const sep = document.createElement("div");
      sep.className = "toolbar-divider";
      toolbar.appendChild(sep);
      continue;
    }

    const btn = document.createElement("button");
    btn.className = item.danger ? "toolbar-btn danger" : "toolbar-btn";
    btn.type = "button";
    btn.title = item.label;
    btn.textContent = item.icon;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      item.action(view);
    });
    toolbar.appendChild(btn);
  }

  const sep = document.createElement("div");
  sep.className = "toolbar-divider";
  toolbar.appendChild(sep);

  const align_btns: AlignmentButtonRefs = new Map();
  for (const { label, icon, value } of ALIGNMENTS) {
    const btn = document.createElement("button");
    btn.className = "toolbar-btn";
    btn.type = "button";
    btn.title = label;
    btn.textContent = icon;
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      align_column(view, value);
    });
    align_btns.set(value, btn);
    toolbar.appendChild(btn);
  }

  return { el: toolbar, align_btns };
}

function update_alignment_buttons(
  align_btns: AlignmentButtonRefs,
  current: ColumnAlignment,
): void {
  for (const [value, btn] of align_btns) {
    if (value === current) {
      btn.classList.add("active");
    } else {
      btn.classList.remove("active");
    }
  }
}

export const table_toolbar_plugin_key = new PluginKey("table-toolbar");

export const table_toolbar_plugin = $prose(() => {
  let toolbar_el: HTMLElement | null = null;
  let backdrop_el: HTMLElement | null = null;
  let align_btn_refs: AlignmentButtonRefs | null = null;

  function remove_toolbar() {
    toolbar_el?.remove();
    backdrop_el?.remove();
    toolbar_el = null;
    backdrop_el = null;
    align_btn_refs = null;
  }

  return new Plugin({
    key: table_toolbar_plugin_key,
    view() {
      return {
        update(view) {
          const { $from } = view.state.selection;
          if (!is_in_table($from)) {
            remove_toolbar();
            return;
          }

          const table_dom = find_table_dom(view);
          if (!table_dom) {
            remove_toolbar();
            return;
          }

          if (!toolbar_el) {
            const { el, align_btns } = create_toolbar_dom(view);
            toolbar_el = el;
            align_btn_refs = align_btns;
            toolbar_el.style.zIndex = String(Z_TABLE_TOOLBAR);
            backdrop_el = create_backdrop(remove_toolbar);
            document.body.appendChild(backdrop_el);
            document.body.appendChild(toolbar_el);
          }

          if (align_btn_refs) {
            const current_align = get_current_column_alignment(view);
            update_alignment_buttons(align_btn_refs, current_align);
          }

          void compute_floating_position(table_dom, toolbar_el, "top").then(
            ({ x, y }) => {
              if (!toolbar_el) return;
              Object.assign(toolbar_el.style, {
                position: "absolute",
                left: `${String(x)}px`,
                top: `${String(y)}px`,
              });
            },
          );
        },
        destroy() {
          remove_toolbar();
        },
      };
    },
  });
});
