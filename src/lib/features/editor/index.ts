export {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
export {
  EditorStore,
  type PendingCursorRestore,
} from "$lib/features/editor/state/editor_store.svelte";
export type {
  BufferRestorePolicy,
  EditorPort,
  InternalLinkSource,
} from "$lib/features/editor/ports";
export { create_lazy_editor_port as create_milkdown_editor_port } from "$lib/features/editor/adapters/lazy_editor_adapter";
export {
  create_ydoc_manager,
  type YDocManager,
} from "$lib/features/editor/adapters/ydoc_manager";
export { default as EditorStatusBar } from "$lib/features/editor/ui/editor_status_bar.svelte";
export { default as SourceEditor } from "$lib/features/editor/ui/source_editor.svelte";
export { default as EditorContextMenu } from "$lib/features/editor/ui/editor_context_menu.svelte";
export type { EditorMode } from "$lib/features/editor/domain/editor_mode";
export type { SlashCommand } from "$lib/features/editor/adapters/slash_command_plugin";
export type { FrontmatterWidgetConfig } from "$lib/features/editor/adapters/frontmatter_view_plugin";
export type { TagPillMenuConfig } from "$lib/features/editor/adapters/tag_pill_plugin";
export type {
  EditorAiContext,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";
export { extract_headings_from_markdown } from "$lib/features/editor/domain/extract_headings";
export {
  resolve_width_mode,
  resolve_note_width_mode,
  can_write_width_frontmatter,
  WIDTH_FRONTMATTER_KEY,
} from "$lib/features/editor/domain/note_width_mode";
export {
  resolve_wiki_link_target,
  resolve_wiki_link_note_path,
  resolve_wiki_file_target,
} from "$lib/features/editor/domain/wiki_link_resolution";
export {
  load_shiki_theme,
  init_highlighter,
  get_highlighter_sync,
  resolve_language,
  DEFAULT_LIGHT_THEME,
} from "$lib/features/editor/adapters/shiki_highlighter";
export { resolve_source_shiki_vars } from "$lib/features/editor/adapters/shiki_source_theme";
export {
  MARKDOWN_HARD_BREAK,
  insert_markdown_hard_break,
  normalize_markdown_line_breaks,
} from "$lib/features/editor/domain/markdown_line_breaks";
export { parse_to_mdast } from "$lib/features/editor/adapters/markdown_pipeline";
export { render_lsp_markdown } from "$lib/features/editor/adapters/lsp_tooltip_renderer";
export {
  ai_menu_plugin_key,
  dispatch_ai_menu,
  get_ai_menu_state,
  reject_ai_inline,
} from "$lib/features/editor/adapters/ai_menu_plugin";
