import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type {
  NavContext,
  KeySequenceResult,
  VimNavContextBindings,
} from "$lib/features/vim_nav/types/vim_nav_types";

type KeyMap = Map<string, { action_id: string; supports_count: boolean }>;

const FILE_TREE_KEYS: KeyMap = new Map([
  ["j", { action_id: ACTION_IDS.vim_nav_file_tree_down, supports_count: true }],
  ["k", { action_id: ACTION_IDS.vim_nav_file_tree_up, supports_count: true }],
  [
    "h",
    { action_id: ACTION_IDS.vim_nav_file_tree_collapse, supports_count: false },
  ],
  [
    "l",
    {
      action_id: ACTION_IDS.vim_nav_file_tree_expand_or_open,
      supports_count: false,
    },
  ],
  [
    "Enter",
    {
      action_id: ACTION_IDS.vim_nav_file_tree_expand_or_open,
      supports_count: false,
    },
  ],
  [
    "gg",
    { action_id: ACTION_IDS.vim_nav_file_tree_top, supports_count: false },
  ],
  [
    "G",
    { action_id: ACTION_IDS.vim_nav_file_tree_bottom, supports_count: false },
  ],
  [
    "/",
    { action_id: ACTION_IDS.vim_nav_file_tree_search, supports_count: false },
  ],
  ["o", { action_id: ACTION_IDS.note_create, supports_count: false }],
  ["r", { action_id: ACTION_IDS.note_request_rename, supports_count: false }],
  ["dd", { action_id: ACTION_IDS.note_request_delete, supports_count: false }],
]);

const TAB_BAR_KEYS: KeyMap = new Map([
  ["J", { action_id: ACTION_IDS.tab_next, supports_count: false }],
  ["K", { action_id: ACTION_IDS.tab_prev, supports_count: false }],
  ["gt", { action_id: ACTION_IDS.tab_next, supports_count: false }],
  ["gT", { action_id: ACTION_IDS.tab_prev, supports_count: false }],
  ["x", { action_id: ACTION_IDS.tab_close, supports_count: false }],
]);

const OUTLINE_KEYS: KeyMap = new Map([
  ["j", { action_id: ACTION_IDS.vim_nav_outline_down, supports_count: true }],
  ["k", { action_id: ACTION_IDS.vim_nav_outline_up, supports_count: true }],
  [
    "Enter",
    { action_id: ACTION_IDS.vim_nav_outline_select, supports_count: false },
  ],
  ["gg", { action_id: ACTION_IDS.vim_nav_outline_top, supports_count: false }],
  [
    "G",
    { action_id: ACTION_IDS.vim_nav_outline_bottom, supports_count: false },
  ],
]);

const GLOBAL_KEYS: KeyMap = new Map([
  [":", { action_id: ACTION_IDS.omnibar_toggle, supports_count: false }],
  [
    " e",
    { action_id: ACTION_IDS.vim_nav_focus_explorer, supports_count: false },
  ],
  [
    " o",
    { action_id: ACTION_IDS.vim_nav_focus_outline, supports_count: false },
  ],
  [" t", { action_id: ACTION_IDS.terminal_toggle, supports_count: false }],
  [" f", { action_id: ACTION_IDS.find_in_file_toggle, supports_count: false }],
  [
    "?",
    { action_id: ACTION_IDS.vim_nav_cheatsheet_toggle, supports_count: false },
  ],
]);

const CONTEXT_KEYMAPS: Record<NavContext, KeyMap> = {
  file_tree: FILE_TREE_KEYS,
  tab_bar: TAB_BAR_KEYS,
  outline: OUTLINE_KEYS,
  omnibar: new Map(),
  none: new Map(),
};

const MULTI_KEY_PREFIXES = new Set(["g", "d", " "]);

export function is_vim_nav_prefix(pending: string, key: string): boolean {
  const combined = pending + key;
  if (pending === "" && MULTI_KEY_PREFIXES.has(key)) return true;
  if (pending === "g") return key === "g" || key === "t" || key === "T";
  if (pending === "d") return key === "d";
  if (pending === " ") return "eotf".includes(key);
  if (/^\d+$/.test(combined)) return true;
  if (/^\d+$/.test(pending) && MULTI_KEY_PREFIXES.has(key)) return true;
  return false;
}

export function resolve_key_sequence(
  context: NavContext,
  sequence: string,
): KeySequenceResult {
  const count_match = sequence.match(/^(\d+)(.+)$/);
  const count = count_match ? parseInt(count_match[1]!, 10) : 1;
  const keys = count_match ? count_match[2]! : sequence;

  const context_map = CONTEXT_KEYMAPS[context];
  const entry = context_map.get(keys) ?? GLOBAL_KEYS.get(keys);

  if (entry) {
    return {
      status: "matched",
      action_id: entry.action_id,
      count: entry.supports_count ? count : 1,
    };
  }

  if (/^\d+$/.test(sequence)) {
    return { status: "pending" };
  }

  const could_still_match =
    has_prefix_match(context_map, keys) || has_prefix_match(GLOBAL_KEYS, keys);
  if (could_still_match) {
    return { status: "pending" };
  }

  return { status: "no_match" };
}

function has_prefix_match(map: KeyMap, prefix: string): boolean {
  for (const key of map.keys()) {
    if (key.startsWith(prefix) && key !== prefix) return true;
  }
  return false;
}

export const ALL_BINDINGS: VimNavContextBindings[] = [
  {
    context: "file_tree",
    label: "File Tree",
    bindings: [
      {
        sequence: "j",
        action_id: ACTION_IDS.vim_nav_file_tree_down,
        label: "Move down",
        supports_count: true,
      },
      {
        sequence: "k",
        action_id: ACTION_IDS.vim_nav_file_tree_up,
        label: "Move up",
        supports_count: true,
      },
      {
        sequence: "h",
        action_id: ACTION_IDS.vim_nav_file_tree_collapse,
        label: "Collapse / go to parent",
      },
      {
        sequence: "l",
        action_id: ACTION_IDS.vim_nav_file_tree_expand_or_open,
        label: "Expand folder / open note",
      },
      {
        sequence: "gg",
        action_id: ACTION_IDS.vim_nav_file_tree_top,
        label: "Jump to top",
      },
      {
        sequence: "G",
        action_id: ACTION_IDS.vim_nav_file_tree_bottom,
        label: "Jump to bottom",
      },
      {
        sequence: "/",
        action_id: ACTION_IDS.vim_nav_file_tree_search,
        label: "Search / filter",
      },
      {
        sequence: "o",
        action_id: ACTION_IDS.note_create,
        label: "Create note",
      },
      {
        sequence: "r",
        action_id: ACTION_IDS.note_request_rename,
        label: "Rename",
      },
      {
        sequence: "dd",
        action_id: ACTION_IDS.note_request_delete,
        label: "Delete",
      },
    ],
  },
  {
    context: "tab_bar",
    label: "Tabs",
    bindings: [
      { sequence: "J", action_id: ACTION_IDS.tab_next, label: "Next tab" },
      { sequence: "K", action_id: ACTION_IDS.tab_prev, label: "Previous tab" },
      { sequence: "gt", action_id: ACTION_IDS.tab_next, label: "Next tab" },
      { sequence: "gT", action_id: ACTION_IDS.tab_prev, label: "Previous tab" },
      { sequence: "x", action_id: ACTION_IDS.tab_close, label: "Close tab" },
    ],
  },
  {
    context: "outline",
    label: "Outline",
    bindings: [
      {
        sequence: "j",
        action_id: ACTION_IDS.vim_nav_outline_down,
        label: "Next heading",
        supports_count: true,
      },
      {
        sequence: "k",
        action_id: ACTION_IDS.vim_nav_outline_up,
        label: "Previous heading",
        supports_count: true,
      },
      {
        sequence: "Enter",
        action_id: ACTION_IDS.vim_nav_outline_select,
        label: "Jump to heading",
      },
      {
        sequence: "gg",
        action_id: ACTION_IDS.vim_nav_outline_top,
        label: "First heading",
      },
      {
        sequence: "G",
        action_id: ACTION_IDS.vim_nav_outline_bottom,
        label: "Last heading",
      },
    ],
  },
  {
    context: "global",
    label: "Global",
    bindings: [
      {
        sequence: ":",
        action_id: ACTION_IDS.omnibar_toggle,
        label: "Command palette",
      },
      {
        sequence: "Space+e",
        action_id: ACTION_IDS.vim_nav_focus_explorer,
        label: "Focus file explorer",
      },
      {
        sequence: "Space+o",
        action_id: ACTION_IDS.vim_nav_focus_outline,
        label: "Focus outline",
      },
      {
        sequence: "Space+t",
        action_id: ACTION_IDS.terminal_toggle,
        label: "Toggle terminal",
      },
      {
        sequence: "Space+f",
        action_id: ACTION_IDS.find_in_file_toggle,
        label: "Find in file",
      },
      {
        sequence: "Escape",
        action_id: ACTION_IDS.vim_nav_focus_editor,
        label: "Return to editor",
      },
      {
        sequence: "?",
        action_id: ACTION_IDS.vim_nav_cheatsheet_toggle,
        label: "Show cheat sheet",
      },
    ],
  },
];
