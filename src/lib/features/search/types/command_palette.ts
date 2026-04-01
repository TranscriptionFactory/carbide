import type { CommandContext } from "./command_context";

export type CommandId =
  | "create_new_note"
  | "create_new_canvas"
  | "change_vault"
  | "open_settings"
  | "open_hotkeys"
  | "sync_index"
  | "reindex_vault"
  | "show_vault_dashboard"
  | "git_version_history"
  | "git_create_checkpoint"
  | "git_init_repo"
  | "git_push"
  | "git_pull"
  | "git_fetch"
  | "git_add_remote"
  | "ai_assistant"
  | "toggle_links_panel"
  | "toggle_graph_panel"
  | "toggle_outline_panel"
  | "toggle_tasks_panel"
  | "toggle_metadata_panel"
  | "toggle_bases_panel"
  | "quick_capture_task"
  | "show_tasks_list"
  | "show_tasks_kanban"
  | "show_tasks_schedule"
  | "check_for_updates"
  | "export_as_pdf"
  | "terminal_toggle"
  | "terminal_new_session"
  | "open_plugins"
  | "toggle_zen_mode"
  | "toggle_focus_mode"
  | "toggle_line_numbers"
  | "toggle_read_only_mode"
  | "fold_toggle"
  | "fold_collapse_all"
  | "fold_expand_all"
  | "graph_load_hierarchy"
  | "query_open"
  | "query_toggle_panel"
  | "zoom_in"
  | "zoom_out"
  | "zoom_reset"
  | "iwe_extract_section"
  | "iwe_extract_all"
  | "iwe_inline_section"
  | "iwe_inline_quote"
  | "iwe_list_to_sections"
  | "iwe_section_to_list"
  | "iwe_sort_list"
  | "iwe_create_link"
  | "delete_note"
  | "duplicate_note"
  | "copy_as_markdown"
  | "copy_as_html"
  | "rename_note"
  | "open_in_split_view"
  | (string & {});

export type CommandIcon =
  | "file-plus"
  | "folder-open"
  | "settings"
  | "keyboard"
  | "git-branch"
  | "history"
  | "bookmark"
  | "link"
  | "list-tree"
  | "refresh-cw"
  | "file-down"
  | "sparkles"
  | "terminal"
  | "blocks"
  | "maximize"
  | (string & {});

export type CommandDefinition = {
  id: CommandId;
  label: string;
  description: string;
  keywords: string[];
  icon: CommandIcon;
  when?: (ctx: CommandContext) => boolean;
};

export type SearchCommandDefinition = CommandDefinition;
