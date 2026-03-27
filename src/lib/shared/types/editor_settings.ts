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
  | "graph"
  | "semantic"
  | "misc"
  | "toolchain"
  | "hotkeys";

export type GitAutocommitMode = "off" | "on_save" | "interval";
export type GitPullStrategy = "merge" | "rebase" | "ff_only";
export type DocumentPdfZoomMode = "actual_size" | "fit_width";
export type DocumentPdfScrollMode = "continuous" | "paginated";
export type DocumentImageBackground = "checkerboard" | "light" | "dark";
export type EditorSpacingDensity =
  | "extra_compact"
  | "compact"
  | "normal"
  | "relaxed"
  | "spacious";
export type EditorLinkUnderlineStyle = "solid" | "dotted" | "wavy";
export type EditorDividerStyle = "gradient" | "solid" | "dashed" | "dotted";
export type EditorCodeBlockPadding = EditorSpacingDensity;
export type EditorCodeBlockRadius = "tight" | "normal" | "soft";
export type EditorBlockquotePadding = EditorSpacingDensity;
export type EditorTableSpacingDensity = EditorSpacingDensity;
export type PanelSide = "left" | "right";
export type OutlineMode = "rail" | "floating";
export type FileTreeStyle =
  | "default"
  | "airy_minimal"
  | "compact"
  | "macos_finder"
  | "refined";
export type LintFormatter = "prettier" | "rumdl";
export type MarkdownLspProvider = "iwes" | "marksman";

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
  editor_heading_spacing_density: EditorSpacingDensity;
  editor_paragraph_spacing_density: EditorSpacingDensity;
  editor_list_spacing_density: EditorSpacingDensity;
  editor_code_block_padding: EditorCodeBlockPadding;
  editor_code_block_radius: EditorCodeBlockRadius;
  editor_code_block_wrap: boolean;
  editor_table_spacing_density: EditorTableSpacingDensity;
  editor_blockquote_padding: EditorBlockquotePadding;
  editor_blockquote_border_width: 2 | 3 | 4;
  editor_link_underline_style: EditorLinkUnderlineStyle;
  editor_divider_style: EditorDividerStyle;
  editor_divider_thickness_px: number;
  editor_divider_color: string;
  editor_divider_spacing: EditorSpacingDensity;
  source_editor_line_numbers: boolean;
  terminal_shell_path: string;
  terminal_font_size_px: number;
  terminal_cursor_blink: boolean;
  terminal_follow_active_vault: boolean;
  terminal_background_color: string;
  terminal_foreground_color: string;
  ai_enabled: boolean;
  ai_providers: AiProviderConfig[];
  ai_default_provider_id: string;
  ai_execution_timeout_seconds: number;
  document_pdf_default_zoom: DocumentPdfZoomMode;
  document_pdf_scroll_mode: DocumentPdfScrollMode;
  document_code_wrap: boolean;
  document_image_background: DocumentImageBackground;
  document_inactive_cache_limit: number;
  semantic_similarity_threshold: number;
  semantic_suggested_links_limit: number;
  semantic_graph_edges_per_note: number;
  semantic_graph_max_vault_size: number;
  semantic_omnibar_fallback_enabled: boolean;
  semantic_omnibar_min_words: number;
  graph_force_link_distance: number;
  graph_force_charge_strength: number;
  graph_force_collision_radius: number;
  graph_force_charge_max_distance: number;
  outline_mode: OutlineMode;
  file_tree_style: FileTreeStyle;
  default_note_name_template: string;
  lint_enabled: boolean;
  lint_format_on_save: boolean;
  lint_formatter: LintFormatter;
  lint_rules_toml: string;
  rumdl_binary_path: string;
  marksman_enabled: boolean;
  markdown_lsp_provider: MarkdownLspProvider;
  marksman_binary_path: string;
  reference_enabled: boolean;
  reference_citation_style: string;
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
  editor_heading_spacing_density: "normal",
  editor_paragraph_spacing_density: "normal",
  editor_list_spacing_density: "normal",
  editor_code_block_padding: "normal",
  editor_code_block_radius: "normal",
  editor_code_block_wrap: false,
  editor_table_spacing_density: "normal",
  editor_blockquote_padding: "normal",
  editor_blockquote_border_width: 2,
  editor_link_underline_style: "solid",
  editor_divider_style: "solid",
  editor_divider_thickness_px: 1,
  editor_divider_color: "",
  editor_divider_spacing: "normal",
  source_editor_line_numbers: false,
  terminal_shell_path: "/bin/zsh",
  terminal_font_size_px: 13,
  terminal_cursor_blink: true,
  terminal_follow_active_vault: false,
  terminal_background_color: "",
  terminal_foreground_color: "",
  ai_enabled: true,
  ai_providers: BUILTIN_PROVIDER_PRESETS,
  ai_default_provider_id: "auto",
  ai_execution_timeout_seconds: 300,
  document_pdf_default_zoom: "fit_width",
  document_pdf_scroll_mode: "continuous",
  document_code_wrap: true,
  document_image_background: "checkerboard",
  document_inactive_cache_limit: 3,
  semantic_similarity_threshold: 0.5,
  semantic_suggested_links_limit: 5,
  semantic_graph_edges_per_note: 3,
  semantic_graph_max_vault_size: 200,
  semantic_omnibar_fallback_enabled: true,
  semantic_omnibar_min_words: 3,
  graph_force_link_distance: 80,
  graph_force_charge_strength: -200,
  graph_force_collision_radius: 20,
  graph_force_charge_max_distance: 500,
  outline_mode: "rail",
  file_tree_style: "airy_minimal",
  default_note_name_template: "",
  lint_enabled: true,
  lint_format_on_save: false,
  lint_formatter: "prettier",
  lint_rules_toml: "",
  rumdl_binary_path: "",
  marksman_enabled: true,
  markdown_lsp_provider: "iwes",
  marksman_binary_path: "",
  reference_enabled: false,
  reference_citation_style: "apa",
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
  "editor_heading_spacing_density",
  "editor_paragraph_spacing_density",
  "editor_list_spacing_density",
  "editor_code_block_padding",
  "editor_code_block_radius",
  "editor_code_block_wrap",
  "editor_table_spacing_density",
  "editor_blockquote_padding",
  "editor_blockquote_border_width",
  "editor_link_underline_style",
  "editor_divider_style",
  "editor_divider_thickness_px",
  "editor_divider_color",
  "editor_divider_spacing",
  "source_editor_line_numbers",
  "terminal_shell_path",
  "terminal_font_size_px",
  "terminal_cursor_blink",
  "terminal_follow_active_vault",
  "terminal_background_color",
  "terminal_foreground_color",
  "ai_enabled",
  "ai_providers",
  "ai_default_provider_id",
  "ai_execution_timeout_seconds",
  "document_pdf_default_zoom",
  "document_pdf_scroll_mode",
  "document_code_wrap",
  "document_image_background",
  "document_inactive_cache_limit",
  "graph_force_link_distance",
  "graph_force_charge_strength",
  "graph_force_collision_radius",
  "graph_force_charge_max_distance",
  "outline_mode",
  "file_tree_style",
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
