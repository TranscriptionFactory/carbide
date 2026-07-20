import type { UIStore } from "$lib/app";

export type PaneSizeField = {
  key: string;
  get: (ui: UIStore) => number;
  set: (ui: UIStore, size: number) => void;
};

export const PANE_SIZE_FIELDS: PaneSizeField[] = [
  {
    key: "sidebar_pane_size",
    get: (ui) => ui.sidebar_pane_size,
    set: (ui, size) => (ui.sidebar_pane_size = size),
  },
  {
    key: "outline_pane_size",
    get: (ui) => ui.outline_pane_size,
    set: (ui, size) => (ui.outline_pane_size = size),
  },
  {
    key: "context_rail_pane_size",
    get: (ui) => ui.context_rail_pane_size,
    set: (ui, size) => (ui.context_rail_pane_size = size),
  },
  {
    key: "bottom_panel_pane_size",
    get: (ui) => ui.bottom_panel_pane_size,
    set: (ui, size) => (ui.bottom_panel_pane_size = size),
  },
  {
    key: "editor_split_pane_size",
    get: (ui) => ui.editor_split_pane_size,
    set: (ui, size) => (ui.editor_split_pane_size = size),
  },
];
