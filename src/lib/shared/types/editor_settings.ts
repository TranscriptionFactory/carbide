import {
  BUILTIN_PROVIDER_PRESETS,
  type AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

// STT removed — archived on archive/stt-main
// export type SttInsertMode = "cursor" | "new_line" | "new_block";

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
  | "mcp"
  // | "speech"
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
export type TerminalFontWeight =
  | "normal"
  | "bold"
  | "100"
  | "200"
  | "300"
  | "400"
  | "500"
  | "600"
  | "700"
  | "800"
  | "900";
export type TerminalCursorStyle = "block" | "underline" | "bar";
export type PanelSide = "left" | "right";
export type OutlineMode = "rail" | "floating";
export type ToolbarVisibility = "always_show" | "always_hide";
export type BlockDragHandleVisibility = "on_hover" | "always_show";
export type FileTreeStyle =
  | "default"
  | "airy_minimal"
  | "compact"
  | "macos_finder"
  | "refined";
export type FileTreeBlurbPosition = "caption" | "heading";
export type LintFormatter = "prettier" | "rumdl";
export type MarkdownLspProvider = "iwes" | "markdown_oxide" | "marksman";

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
  editor_spellcheck: boolean;
  editor_heading_markers: boolean;
  terminal_shell_path: string;
  terminal_font_size_px: number;
  terminal_cursor_blink: boolean;
  terminal_follow_active_vault: boolean;
  terminal_background_color: string;
  terminal_foreground_color: string;
  terminal_font_family: string;
  terminal_font_weight: TerminalFontWeight;
  terminal_font_weight_bold: TerminalFontWeight;
  terminal_line_height: number;
  terminal_cursor_style: TerminalCursorStyle;
  terminal_scrollback: number;
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
  semantic_omnibar_enabled: boolean;
  graph_force_link_distance: number;
  graph_force_charge_strength: number;
  graph_force_collision_radius: number;
  graph_force_charge_max_distance: number;
  outline_mode: OutlineMode;
  editor_toolbar_visibility: ToolbarVisibility;
  file_tree_style: FileTreeStyle;
  file_tree_show_blurb: boolean;
  file_tree_blurb_position: FileTreeBlurbPosition;
  file_tree_show_linked_sources: boolean;
  default_note_name_template: string;
  lint_enabled: boolean;
  lint_format_on_save: boolean;
  lint_formatter: LintFormatter;
  lint_rules_toml: string;
  rumdl_binary_path: string;
  markdown_lsp_enabled: boolean;
  markdown_lsp_provider: MarkdownLspProvider;
  markdown_lsp_binary_path: string;
  iwe_ai_provider_id: string;
  reference_enabled: boolean;
  reference_citation_style: string;
  reference_include_sources_in_search: boolean;
  editor_block_drag_handle: boolean;
  editor_block_drag_handle_visibility: BlockDragHandleVisibility;
  vim_nav_enabled: boolean;
  mcp_enabled: boolean;
  // STT removed — archived on archive/stt-main
  // stt_enabled: boolean;
  // stt_model_id: string;
  // stt_language: string;
  // stt_vad_threshold: number;
  // stt_filter_filler_words: boolean;
  // stt_custom_words: string[];
  // stt_idle_unload_minutes: number;
  // stt_insert_mode: SttInsertMode;
  // stt_streaming_enabled: boolean;
  // stt_ai_cleanup_enabled: boolean;
  // stt_ai_cleanup_prompt: string;
  embedding_note_enabled: boolean;
  embedding_block_enabled: boolean;
  native_link_hover_enabled: boolean;
  native_wiki_suggest_enabled: boolean;
  native_link_click_enabled: boolean;
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
  editor_spellcheck: true,
  editor_heading_markers: false,
  terminal_shell_path: "/bin/zsh",
  terminal_font_size_px: 13,
  terminal_cursor_blink: true,
  terminal_follow_active_vault: false,
  terminal_background_color: "",
  terminal_foreground_color: "",
  terminal_font_family: "",
  terminal_font_weight: "normal",
  terminal_font_weight_bold: "bold",
  terminal_line_height: 1.3,
  terminal_cursor_style: "block",
  terminal_scrollback: 1000,
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
  semantic_omnibar_enabled: true,
  graph_force_link_distance: 80,
  graph_force_charge_strength: -200,
  graph_force_collision_radius: 20,
  graph_force_charge_max_distance: 500,
  outline_mode: "rail",
  editor_toolbar_visibility: "always_show",
  file_tree_style: "airy_minimal",
  file_tree_show_blurb: false,
  file_tree_blurb_position: "caption",
  file_tree_show_linked_sources: true,
  default_note_name_template: "",
  lint_enabled: true,
  lint_format_on_save: false,
  lint_formatter: "prettier",
  lint_rules_toml: "",
  rumdl_binary_path: "",
  markdown_lsp_enabled: true,
  markdown_lsp_provider: "iwes",
  markdown_lsp_binary_path: "",
  iwe_ai_provider_id: "auto",
  reference_enabled: false,
  reference_citation_style: "apa",
  reference_include_sources_in_search: true,
  editor_block_drag_handle: true,
  editor_block_drag_handle_visibility: "on_hover",
  vim_nav_enabled: false,
  mcp_enabled: true,
  // STT removed — archived on archive/stt-main
  // stt_enabled: false,
  // stt_model_id: "moonshine-base",
  // stt_language: "auto",
  // stt_vad_threshold: 0.3,
  // stt_filter_filler_words: true,
  // stt_custom_words: [],
  // stt_idle_unload_minutes: 5,
  // stt_insert_mode: "cursor",
  // stt_streaming_enabled: true,
  // stt_ai_cleanup_enabled: false,
  // stt_ai_cleanup_prompt:
  //   "Clean up this dictated text. Fix grammar, remove filler words, maintain the speaker's intent and tone.",
  embedding_note_enabled: true,
  embedding_block_enabled: true,
  native_link_hover_enabled: true,
  native_wiki_suggest_enabled: true,
  native_link_click_enabled: true,
};

export const SETTINGS_KEY = "editor" as const;

export const EDITOR_SPACING_DENSITY_OPTIONS: {
  value: EditorSpacingDensity;
  label: string;
}[] = [
  { value: "extra_compact", label: "Extra Compact" },
  { value: "compact", label: "Compact" },
  { value: "normal", label: "Normal" },
  { value: "relaxed", label: "Relaxed" },
  { value: "spacious", label: "Spacious" },
];

export const EDITOR_CODE_BLOCK_RADIUS_OPTIONS: {
  value: EditorCodeBlockRadius;
  label: string;
}[] = [
  { value: "tight", label: "Tight" },
  { value: "normal", label: "Normal" },
  { value: "soft", label: "Soft" },
];

export const EDITOR_BLOCKQUOTE_BORDER_WIDTH_OPTIONS = [2, 3, 4].map((n) => ({
  value: String(n),
  label: `${String(n)} px`,
}));

export const EDITOR_LINK_UNDERLINE_STYLE_OPTIONS: {
  value: EditorLinkUnderlineStyle;
  label: string;
}[] = [
  { value: "solid", label: "Solid" },
  { value: "dotted", label: "Dotted" },
  { value: "wavy", label: "Wavy" },
];

export const EDITOR_DIVIDER_STYLE_OPTIONS: {
  value: EditorDividerStyle;
  label: string;
}[] = [
  { value: "gradient", label: "Gradient" },
  { value: "solid", label: "Solid" },
  { value: "dashed", label: "Dashed" },
  { value: "dotted", label: "Dotted" },
];

export const EDITOR_TOOLBAR_VISIBILITY_OPTIONS: {
  value: ToolbarVisibility;
  label: string;
}[] = [
  { value: "always_show", label: "Always Show" },
  { value: "always_hide", label: "Always Hide" },
];

export const EDITOR_BLOCK_DRAG_HANDLE_VISIBILITY_OPTIONS: {
  value: BlockDragHandleVisibility;
  label: string;
}[] = [
  { value: "on_hover", label: "On Hover" },
  { value: "always_show", label: "Always Show" },
];

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
  "editor_spellcheck",
  "editor_heading_markers",
  "terminal_shell_path",
  "terminal_font_size_px",
  "terminal_cursor_blink",
  "terminal_follow_active_vault",
  "terminal_background_color",
  "terminal_foreground_color",
  "terminal_font_family",
  "terminal_font_weight",
  "terminal_font_weight_bold",
  "terminal_line_height",
  "terminal_cursor_style",
  "terminal_scrollback",
  "ai_enabled",
  "ai_providers",
  "ai_default_provider_id",
  "ai_execution_timeout_seconds",
  "iwe_ai_provider_id",
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
  "editor_toolbar_visibility",
  "file_tree_style",
  "file_tree_show_blurb",
  "file_tree_blurb_position",
  "editor_block_drag_handle",
  "editor_block_drag_handle_visibility",
  "vim_nav_enabled",
  "mcp_enabled",
  // STT removed — archived on archive/stt-main
  // "stt_enabled",
  // "stt_model_id",
  // "stt_language",
  // "stt_vad_threshold",
  // "stt_filter_filler_words",
  // "stt_custom_words",
  // "stt_idle_unload_minutes",
  // "stt_insert_mode",
  // "stt_streaming_enabled",
  // "stt_ai_cleanup_enabled",
  // "stt_ai_cleanup_prompt",
  "embedding_note_enabled",
  "embedding_block_enabled",
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
