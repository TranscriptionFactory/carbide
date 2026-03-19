export type CommandId =
  | "create_new_note"
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
};

export type SearchCommandDefinition = CommandDefinition;
