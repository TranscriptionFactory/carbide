import type { Theme, ColorSchemePreference } from "$lib/shared/types/theme";
import {
  DEFAULT_THEME_ID,
  DEFAULT_LIGHT_THEME_ID,
  DEFAULT_DARK_THEME_ID,
  get_all_themes,
  resolve_theme,
} from "$lib/shared/types/theme";
import type {
  EditorSettings,
  SettingsCategory,
} from "$lib/shared/types/editor_settings";
import { DEFAULT_EDITOR_SETTINGS } from "$lib/shared/types/editor_settings";
import type { NoteMeta } from "$lib/shared/types/note";
import type { NoteId, NotePath, VaultId } from "$lib/shared/types/ids";
import type {
  FolderLoadState,
  FolderPaginationState,
  MoveItem,
} from "$lib/shared/types/filetree";
import type { PastedImagePayload } from "$lib/shared/types/editor";
import type { OmnibarScope } from "$lib/shared/types/search";
import type {
  HotkeyConfig,
  HotkeyOverride,
  HotkeyRecorderState,
} from "$lib/features/hotkey";
import { SvelteMap, SvelteSet } from "svelte/reactivity";

type AsyncStatus = "idle" | "loading" | "error";
type SidebarView =
  | "explorer"
  | "dashboard"
  | "starred"
  | "graph"
  | "tasks"
  | (string & {});
type ContextRailTab =
  | "links"
  | "outline"
  | "ai"
  | "graph"
  | "tasks"
  | "metadata";
export type BottomPanelTab =
  | "terminal"
  | "problems"
  | "iwe_results"
  | "lsp_results"
  | "query";

const INITIAL_DELETE_NOTE_DIALOG = { open: false, note: null } as const;

const INITIAL_IWE_RENAME_DIALOG = {
  open: false,
  file_path: "",
  line: 0,
  character: 0,
  placeholder: "",
  new_name: "",
} as const;

const INITIAL_RENAME_NOTE_DIALOG = {
  open: false,
  note: null,
  new_name: "",
  show_overwrite_confirm: false,
  is_checking_conflict: false,
} as const;

const INITIAL_SAVE_NOTE_DIALOG = {
  open: false,
  new_path: null,
  folder_path: "",
  show_overwrite_confirm: false,
  is_checking_existence: false,
  source: "manual" as "manual" | "tab_close",
} as const;

const INITIAL_CREATE_FOLDER_DIALOG = {
  open: false,
  parent_path: "",
  folder_name: "",
} as const;

const INITIAL_CREATE_CANVAS_DIALOG = {
  open: false,
  folder_path: "",
  canvas_name: "",
} as const;

const INITIAL_DELETE_FOLDER_DIALOG = {
  open: false,
  folder_path: null,
  affected_note_count: 0,
  affected_folder_count: 0,
  status: "idle",
} as const;

const INITIAL_RENAME_FOLDER_DIALOG = {
  open: false,
  folder_path: null,
  new_name: "",
} as const;

const INITIAL_FILETREE_MOVE_CONFLICT_DIALOG = {
  open: false,
  target_folder: "",
  items: [] as MoveItem[],
  conflicts: [] as { path: string; new_path: string; error: string }[],
} as const;

const INITIAL_OMNIBAR = {
  open: false,
  query: "",
  selected_index: 0,
  is_searching: false,
  scope: "current_vault",
} as const;

const INITIAL_FIND_IN_FILE = {
  open: false,
  query: "",
  selected_match_index: 0,
  replace_text: "",
  show_replace: false,
} as const;

const INITIAL_IMAGE_PASTE_DIALOG = {
  open: false,
  note_id: null,
  note_path: null,
  image: null,
  filename: "",
  estimated_size_bytes: 0,
  target_folder: "",
} as const;

const INITIAL_CROSS_VAULT_OPEN_CONFIRM = {
  open: false,
  target_vault_id: null,
  target_vault_name: "",
  note_path: null,
} as const;

const INITIAL_HELP_DIALOG = {
  open: false,
} as const;

const INITIAL_VAULT_DASHBOARD = {
  open: false,
} as const;

const INITIAL_TAB_CLOSE_CONFIRM = {
  open: false,
  tab_id: null as string | null,
  tab_title: "",
  pending_dirty_tab_ids: [] as string[],
  close_mode: "single" as "single" | "all" | "other" | "right",
  keep_tab_id: null as string | null,
  apply_to_all: false,
};

const INITIAL_VERSION_HISTORY_DIALOG = {
  open: false,
  note_path: null,
} as const;

const INITIAL_CHECKPOINT_DIALOG = {
  open: false,
  description: "",
} as const;

const INITIAL_ADD_REMOTE_DIALOG = {
  open: false,
  url: "",
} as const;

const INITIAL_HOTKEY_RECORDER: HotkeyRecorderState = {
  open: false,
  action_id: null,
  current_key: null,
  pending_key: null,
  conflict: null,
  error: null,
} as const;

function initial_filetree() {
  return {
    expanded_paths: new SvelteSet<string>(),
    load_states: new SvelteMap<string, FolderLoadState>(),
    error_messages: new SvelteMap<string, string>(),
    pagination: new SvelteMap<string, FolderPaginationState>(),
  };
}

function initial_settings_dialog(settings: EditorSettings) {
  return {
    open: false,
    current_settings: { ...settings },
    persisted_settings: { ...settings },
    git_remote_url: "",
    persisted_git_remote_url: "",
    has_unsaved_changes: false,
    active_category: "theme" as SettingsCategory,
    hotkey_draft_overrides: [] as HotkeyOverride[],
    hotkey_draft_config: { bindings: [] } as HotkeyConfig,
    all_folder_paths: [] as string[],
  };
}

export class UIStore {
  user_themes = $state<Theme[]>([]);
  active_theme_id = $state<string>(DEFAULT_THEME_ID);

  color_scheme_preference = $state<ColorSchemePreference>("dark");
  system_light_theme_id = $state<string>(DEFAULT_LIGHT_THEME_ID);
  system_dark_theme_id = $state<string>(DEFAULT_DARK_THEME_ID);
  system_prefers_dark = $state<boolean>(true);

  resolved_theme_id = $derived<string>(
    this.color_scheme_preference === "system"
      ? this.system_prefers_dark
        ? this.system_dark_theme_id
        : this.system_light_theme_id
      : this.active_theme_id,
  );

  active_theme = $derived<Theme>(
    resolve_theme(get_all_themes(this.user_themes), this.resolved_theme_id),
  );

  sidebar_open = $state(true);
  zen_mode = $state(false);
  floating_outline_collapsed = $state(false);
  sidebar_view = $state<SidebarView>("explorer");
  selected_folder_path = $state("");
  filetree_revealed_note_path = $state("");
  selected_items = $state(new SvelteSet<string>());
  selection_anchor = $state<string | null>(null);
  editor_settings = $state<EditorSettings>({ ...DEFAULT_EDITOR_SETTINGS });
  system_dialog_open = $state(false);
  recent_command_ids = $state<string[]>([]);

  startup = $state<{ status: AsyncStatus; error: string | null }>({
    status: "idle",
    error: null,
  });

  change_vault = $state<{
    open: boolean;
    confirm_discard_open: boolean;
    is_loading: boolean;
    error: string | null;
  }>({
    open: false,
    confirm_discard_open: false,
    is_loading: false,
    error: null,
  });

  delete_note_dialog = $state<{ open: boolean; note: NoteMeta | null }>({
    ...INITIAL_DELETE_NOTE_DIALOG,
  });

  rename_note_dialog = $state<{
    open: boolean;
    note: NoteMeta | null;
    new_name: string;
    show_overwrite_confirm: boolean;
    is_checking_conflict: boolean;
  }>({ ...INITIAL_RENAME_NOTE_DIALOG });

  save_note_dialog = $state<{
    open: boolean;
    new_path: NotePath | null;
    folder_path: string;
    show_overwrite_confirm: boolean;
    is_checking_existence: boolean;
    source: "manual" | "tab_close";
  }>({ ...INITIAL_SAVE_NOTE_DIALOG });

  iwe_rename_dialog = $state<{
    open: boolean;
    file_path: string;
    line: number;
    character: number;
    placeholder: string;
    new_name: string;
  }>({ ...INITIAL_IWE_RENAME_DIALOG });

  create_folder_dialog = $state<{
    open: boolean;
    parent_path: string;
    folder_name: string;
  }>({ ...INITIAL_CREATE_FOLDER_DIALOG });

  create_canvas_dialog = $state<{
    open: boolean;
    folder_path: string;
    canvas_name: string;
  }>({ ...INITIAL_CREATE_CANVAS_DIALOG });

  delete_folder_dialog = $state<{
    open: boolean;
    folder_path: string | null;
    affected_note_count: number;
    affected_folder_count: number;
    status: "idle" | "fetching_stats" | "confirming" | "error";
  }>({ ...INITIAL_DELETE_FOLDER_DIALOG });

  rename_folder_dialog = $state<{
    open: boolean;
    folder_path: string | null;
    new_name: string;
  }>({ ...INITIAL_RENAME_FOLDER_DIALOG });

  filetree_move_conflict_dialog = $state<{
    open: boolean;
    target_folder: string;
    items: MoveItem[];
    conflicts: { path: string; new_path: string; error: string }[];
  }>({ ...INITIAL_FILETREE_MOVE_CONFLICT_DIALOG });

  theme_has_draft = $state(false);

  settings_dialog = $state<{
    open: boolean;
    current_settings: EditorSettings;
    persisted_settings: EditorSettings;
    git_remote_url: string;
    persisted_git_remote_url: string;
    has_unsaved_changes: boolean;
    active_category: SettingsCategory;
    hotkey_draft_overrides: HotkeyOverride[];
    hotkey_draft_config: HotkeyConfig;
    all_folder_paths: string[];
  }>(initial_settings_dialog(DEFAULT_EDITOR_SETTINGS));

  omnibar = $state<{
    open: boolean;
    query: string;
    selected_index: number;
    is_searching: boolean;
    scope: OmnibarScope;
  }>({ ...INITIAL_OMNIBAR });

  find_in_file = $state<{
    open: boolean;
    query: string;
    selected_match_index: number;
    replace_text: string;
    show_replace: boolean;
  }>({ ...INITIAL_FIND_IN_FILE });

  filetree = $state<{
    expanded_paths: SvelteSet<string>;
    load_states: SvelteMap<string, FolderLoadState>;
    error_messages: SvelteMap<string, string>;
    pagination: SvelteMap<string, FolderPaginationState>;
  }>(initial_filetree());

  image_paste_dialog = $state<{
    open: boolean;
    note_id: NoteId | null;
    note_path: NotePath | null;
    image: PastedImagePayload | null;
    filename: string;
    estimated_size_bytes: number;
    target_folder: string;
  }>({ ...INITIAL_IMAGE_PASTE_DIALOG });

  cross_vault_open_confirm = $state<{
    open: boolean;
    target_vault_id: VaultId | null;
    target_vault_name: string;
    note_path: NotePath | null;
  }>({ ...INITIAL_CROSS_VAULT_OPEN_CONFIRM });

  help_dialog = $state<{ open: boolean }>({ ...INITIAL_HELP_DIALOG });

  vault_dashboard = $state<{
    open: boolean;
  }>({ ...INITIAL_VAULT_DASHBOARD });

  tab_close_confirm = $state<{
    open: boolean;
    tab_id: string | null;
    tab_title: string;
    pending_dirty_tab_ids: string[];
    close_mode: "single" | "all" | "other" | "right";
    keep_tab_id: string | null;
    apply_to_all: boolean;
  }>({ ...INITIAL_TAB_CLOSE_CONFIRM });

  version_history_dialog = $state<{
    open: boolean;
    note_path: NotePath | null;
  }>({ ...INITIAL_VERSION_HISTORY_DIALOG });

  checkpoint_dialog = $state<{
    open: boolean;
    description: string;
  }>({ ...INITIAL_CHECKPOINT_DIALOG });

  add_remote_dialog = $state<{
    open: boolean;
    url: string;
  }>({ ...INITIAL_ADD_REMOTE_DIALOG });

  vault_switcher_open = $state(false);

  tab_drag_active = $state(false);

  quick_capture_open = $state(false);

  bottom_panel_open = $state(false);
  bottom_panel_tab = $state<BottomPanelTab>("terminal");

  context_rail_open = $state(false);
  context_rail_tab = $state<ContextRailTab>("links");
  context_rail_side = $state<"left" | "right">("right");

  hotkeys_config = $state<HotkeyConfig>({ bindings: [] });

  hotkey_overrides = $state<HotkeyOverride[]>([]);

  hotkey_recorder = $state<HotkeyRecorderState>({
    ...INITIAL_HOTKEY_RECORDER,
  });

  set_active_theme_id(id: string) {
    this.active_theme_id = id;
  }

  set_color_scheme_preference(pref: ColorSchemePreference) {
    this.color_scheme_preference = pref;
  }

  set_system_light_theme_id(id: string) {
    this.system_light_theme_id = id;
  }

  set_system_dark_theme_id(id: string) {
    this.system_dark_theme_id = id;
  }

  set_system_prefers_dark(prefers_dark: boolean) {
    this.system_prefers_dark = prefers_dark;
  }

  set_user_themes(themes: Theme[]) {
    this.user_themes = themes;
  }

  toggle_sidebar() {
    this.sidebar_open = !this.sidebar_open;
  }

  toggle_zen_mode() {
    this.zen_mode = !this.zen_mode;
  }

  set_zen_mode(value: boolean) {
    this.zen_mode = value;
  }

  set_sidebar_view(view: SidebarView) {
    this.sidebar_view = view;
    this.sidebar_open = true;
  }

  set_selected_folder_path(path: string) {
    this.selected_folder_path = path;
    this.filetree_revealed_note_path = "";
  }

  clear_selected_items() {
    this.selected_items = new SvelteSet<string>();
    this.selection_anchor = null;
  }

  set_single_selected_item(path: string) {
    const selected = new SvelteSet<string>();
    if (path) {
      selected.add(path);
    }
    this.selected_items = selected;
    this.selection_anchor = path || null;
  }

  toggle_selected_item(path: string) {
    if (!path) {
      return;
    }
    const selected = new SvelteSet<string>(this.selected_items);
    if (selected.has(path)) {
      selected.delete(path);
    } else {
      selected.add(path);
    }
    this.selected_items = selected;
    this.selection_anchor = path;
  }

  select_item_range(ordered_paths: string[], to_path: string) {
    if (!to_path || ordered_paths.length === 0) {
      return;
    }
    const anchor = this.selection_anchor ?? to_path;
    const from_index = ordered_paths.indexOf(anchor);
    const to_index = ordered_paths.indexOf(to_path);
    if (from_index < 0 || to_index < 0) {
      this.set_single_selected_item(to_path);
      return;
    }
    const start = Math.min(from_index, to_index);
    const end = Math.max(from_index, to_index);
    const selected = new SvelteSet<string>();
    for (let i = start; i <= end; i += 1) {
      const path = ordered_paths[i];
      if (path) {
        selected.add(path);
      }
    }
    this.selected_items = selected;
  }

  set_filetree_revealed_note_path(path: string) {
    this.filetree_revealed_note_path = path;
  }

  toggle_vault_switcher() {
    this.vault_switcher_open = !this.vault_switcher_open;
  }

  toggle_context_rail() {
    this.context_rail_open = !this.context_rail_open;
  }

  close_context_rail(tab: ContextRailTab = this.context_rail_tab) {
    this.context_rail_tab = tab;
    this.context_rail_open = false;
  }

  set_context_rail_tab(tab: ContextRailTab) {
    this.context_rail_tab = tab;
    this.context_rail_open = true;
  }

  set_editor_settings(settings: EditorSettings) {
    this.editor_settings = settings;
  }

  set_system_dialog_open(open: boolean) {
    this.system_dialog_open = open;
  }

  set_recent_command_ids(ids: string[]) {
    this.recent_command_ids = ids;
  }

  add_recent_command(id: string, max_size: number) {
    const filtered = this.recent_command_ids.filter((c) => c !== id);
    this.recent_command_ids = [id, ...filtered].slice(0, max_size);
  }

  set_hotkeys_config(config: HotkeyConfig) {
    this.hotkeys_config = config;
  }

  reset_for_new_vault() {
    this.selected_folder_path = "";
    this.filetree_revealed_note_path = "";
    this.delete_note_dialog = { ...INITIAL_DELETE_NOTE_DIALOG };
    this.iwe_rename_dialog = { ...INITIAL_IWE_RENAME_DIALOG };
    this.rename_note_dialog = { ...INITIAL_RENAME_NOTE_DIALOG };
    this.save_note_dialog = { ...INITIAL_SAVE_NOTE_DIALOG };
    this.create_folder_dialog = { ...INITIAL_CREATE_FOLDER_DIALOG };
    this.create_canvas_dialog = { ...INITIAL_CREATE_CANVAS_DIALOG };
    this.delete_folder_dialog = { ...INITIAL_DELETE_FOLDER_DIALOG };
    this.rename_folder_dialog = { ...INITIAL_RENAME_FOLDER_DIALOG };
    this.settings_dialog = initial_settings_dialog(this.editor_settings);
    this.omnibar = { ...INITIAL_OMNIBAR };
    this.find_in_file = { ...INITIAL_FIND_IN_FILE };
    this.filetree = initial_filetree();
    this.selected_items = new SvelteSet<string>();
    this.selection_anchor = null;
    this.image_paste_dialog = { ...INITIAL_IMAGE_PASTE_DIALOG };
    this.filetree_move_conflict_dialog = {
      ...INITIAL_FILETREE_MOVE_CONFLICT_DIALOG,
    };
    this.cross_vault_open_confirm = { ...INITIAL_CROSS_VAULT_OPEN_CONFIRM };
    this.help_dialog = { ...INITIAL_HELP_DIALOG };
    this.vault_dashboard = { ...INITIAL_VAULT_DASHBOARD };
    this.tab_close_confirm = { ...INITIAL_TAB_CLOSE_CONFIRM };
    this.version_history_dialog = { ...INITIAL_VERSION_HISTORY_DIALOG };
    this.checkpoint_dialog = { ...INITIAL_CHECKPOINT_DIALOG };
    this.add_remote_dialog = { ...INITIAL_ADD_REMOTE_DIALOG };
    this.vault_switcher_open = false;
    this.zen_mode = false;
    this.context_rail_open = false;
    this.context_rail_tab = "links";
  }
}
