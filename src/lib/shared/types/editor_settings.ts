export type SettingsCategory =
  | "theme"
  | "ai"
  | "layout"
  | "files"
  | "git"
  | "documents"
  | "terminal"
  | "misc"
  | "hotkeys";

export type GitAutocommitMode = "off" | "on_save" | "interval";
export type GitPullStrategy = "merge" | "rebase" | "ff_only";
export type DocumentPdfZoomMode = "actual_size" | "fit_width";
export type DocumentImageBackground = "checkerboard" | "light" | "dark";

export type EditorSettings = {
  attachment_folder: string;
  show_hidden_files: boolean;
  autosave_enabled: boolean;
  git_autocommit_mode: GitAutocommitMode;
  git_autocommit_interval_minutes: number;
  git_pull_strategy: GitPullStrategy;
  git_auto_fetch_interval_minutes: number;
  show_vault_dashboard_on_open: boolean;
  max_open_tabs: number;
  editor_max_width_ch: number;
  terminal_shell_path: string;
  terminal_font_size_px: number;
  terminal_scrollback: number;
  terminal_cursor_blink: boolean;
  terminal_follow_active_vault: boolean;
  ai_ollama_model: string;
  ai_claude_command: string;
  ai_codex_command: string;
  ai_ollama_command: string;
  ai_execution_timeout_seconds: number;
  document_pdf_default_zoom: DocumentPdfZoomMode;
  document_code_wrap: boolean;
  document_image_background: DocumentImageBackground;
  document_inactive_cache_limit: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  attachment_folder: ".assets",
  show_hidden_files: false,
  autosave_enabled: true,
  git_autocommit_mode: "off",
  git_autocommit_interval_minutes: 5,
  git_pull_strategy: "merge",
  git_auto_fetch_interval_minutes: 0,
  show_vault_dashboard_on_open: true,
  max_open_tabs: 5,
  editor_max_width_ch: 85,
  terminal_shell_path: "/bin/zsh",
  terminal_font_size_px: 13,
  terminal_scrollback: 5000,
  terminal_cursor_blink: true,
  terminal_follow_active_vault: false,
  ai_ollama_model: "qwen3:8b",
  ai_claude_command: "claude",
  ai_codex_command: "codex",
  ai_ollama_command: "ollama",
  ai_execution_timeout_seconds: 300,
  document_pdf_default_zoom: "actual_size",
  document_code_wrap: true,
  document_image_background: "checkerboard",
  document_inactive_cache_limit: 3,
};

export const SETTINGS_KEY = "editor" as const;

export const GLOBAL_ONLY_SETTING_KEYS: readonly (keyof EditorSettings)[] = [
  "show_vault_dashboard_on_open",
  "git_autocommit_mode",
  "git_autocommit_interval_minutes",
  "git_pull_strategy",
  "git_auto_fetch_interval_minutes",
  "autosave_enabled",
  "editor_max_width_ch",
  "terminal_shell_path",
  "terminal_font_size_px",
  "terminal_scrollback",
  "terminal_cursor_blink",
  "terminal_follow_active_vault",
  "ai_ollama_model",
  "ai_claude_command",
  "ai_codex_command",
  "ai_ollama_command",
  "ai_execution_timeout_seconds",
  "document_pdf_default_zoom",
  "document_code_wrap",
  "document_image_background",
  "document_inactive_cache_limit",
] as const;

const GLOBAL_ONLY_SET = new Set<string>(GLOBAL_ONLY_SETTING_KEYS);

export function omit_global_only_keys(
  record: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (!GLOBAL_ONLY_SET.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

export async function apply_global_only_overrides(
  base: EditorSettings,
  get_setting: (key: string) => Promise<unknown>,
): Promise<EditorSettings> {
  const result = { ...base };
  const entries = await Promise.all(
    GLOBAL_ONLY_SETTING_KEYS.map(async (key) => ({
      key,
      value: await get_setting(key),
    })),
  );
  for (const { key, value } of entries) {
    if (typeof value === typeof base[key]) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
