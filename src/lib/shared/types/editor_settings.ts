import {
  BUILTIN_PROVIDER_PRESETS,
  type AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

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
export type EditorSpacingDensity = "compact" | "normal" | "relaxed";
export type EditorLinkUnderlineStyle = "solid" | "dotted" | "wavy";
export type EditorCodeBlockPadding = "compact" | "normal" | "relaxed";
export type EditorCodeBlockRadius = "tight" | "normal" | "soft";
export type EditorBlockquotePadding = "compact" | "normal" | "relaxed";
export type PanelSide = "left" | "right";

export type EditorSettings = {
  attachment_folder: string;
  ignored_folders: string[];
  show_hidden_files: boolean;
  autosave_enabled: boolean;
  autosave_delay_ms: number;
  git_autocommit_mode: GitAutocommitMode;
  git_autocommit_interval_minutes: number;
  git_pull_strategy: GitPullStrategy;
  git_auto_fetch_interval_minutes: number;
  show_vault_dashboard_on_open: boolean;
  max_open_tabs: number;
  editor_max_width_ch: number;
  editor_selection_color: string;
  editor_paragraph_spacing_density: EditorSpacingDensity;
  editor_list_spacing_density: EditorSpacingDensity;
  editor_code_block_padding: EditorCodeBlockPadding;
  editor_code_block_radius: EditorCodeBlockRadius;
  editor_blockquote_padding: EditorBlockquotePadding;
  editor_blockquote_border_width: 2 | 3 | 4;
  editor_link_underline_style: EditorLinkUnderlineStyle;
  terminal_shell_path: string;
  terminal_font_size_px: number;
  terminal_cursor_blink: boolean;
  terminal_follow_active_vault: boolean;
  ai_enabled: boolean;
  ai_providers: AiProviderConfig[];
  ai_default_provider_id: string;
  ai_execution_timeout_seconds: number;
  document_pdf_default_zoom: DocumentPdfZoomMode;
  document_code_wrap: boolean;
  document_image_background: DocumentImageBackground;
  document_inactive_cache_limit: number;
};

export const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  attachment_folder: ".assets",
  ignored_folders: [],
  show_hidden_files: false,
  autosave_enabled: true,
  autosave_delay_ms: 2000,
  git_autocommit_mode: "off",
  git_autocommit_interval_minutes: 5,
  git_pull_strategy: "merge",
  git_auto_fetch_interval_minutes: 0,
  show_vault_dashboard_on_open: false,
  max_open_tabs: 5,
  editor_max_width_ch: 90,
  editor_selection_color: "",
  editor_paragraph_spacing_density: "normal",
  editor_list_spacing_density: "normal",
  editor_code_block_padding: "normal",
  editor_code_block_radius: "normal",
  editor_blockquote_padding: "normal",
  editor_blockquote_border_width: 2,
  editor_link_underline_style: "solid",
  terminal_shell_path: "/bin/zsh",
  terminal_font_size_px: 13,
  terminal_cursor_blink: true,
  terminal_follow_active_vault: false,
  ai_enabled: true,
  ai_providers: BUILTIN_PROVIDER_PRESETS,
  ai_default_provider_id: "auto",
  ai_execution_timeout_seconds: 300,
  document_pdf_default_zoom: "fit_width",
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
  "autosave_delay_ms",
  "editor_max_width_ch",
  "editor_selection_color",
  "editor_paragraph_spacing_density",
  "editor_list_spacing_density",
  "editor_code_block_padding",
  "editor_code_block_radius",
  "editor_blockquote_padding",
  "editor_blockquote_border_width",
  "editor_link_underline_style",
  "terminal_shell_path",
  "terminal_font_size_px",
  "terminal_cursor_blink",
  "terminal_follow_active_vault",
  "ai_enabled",
  "ai_providers",
  "ai_default_provider_id",
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
    if (
      value !== null &&
      typeof value === typeof base[key] &&
      Array.isArray(value) === Array.isArray(base[key])
    ) {
      (result as Record<string, unknown>)[key] = value;
    }
  }
  return result;
}
