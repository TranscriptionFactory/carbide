export {
  EditorService,
  type EditorServiceCallbacks,
} from "$lib/features/editor/application/editor_service";
export { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
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
export type {
  EditorAiContext,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";
export { extract_headings_from_markdown } from "$lib/features/editor/domain/extract_headings";
export { load_shiki_theme } from "$lib/features/editor/adapters/shiki_highlighter";
export { resolve_source_shiki_vars } from "$lib/features/editor/adapters/shiki_source_theme";
export {
  MARKDOWN_HARD_BREAK,
  insert_markdown_hard_break,
  normalize_markdown_line_breaks,
} from "$lib/features/editor/domain/markdown_line_breaks";
export { parse_to_mdast } from "$lib/features/editor/adapters/markdown_pipeline";
