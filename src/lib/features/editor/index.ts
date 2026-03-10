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
export { create_lazy_milkdown_editor_port as create_milkdown_editor_port } from "$lib/features/editor/adapters/lazy_milkdown_adapter";
export { default as EditorStatusBar } from "$lib/features/editor/ui/editor_status_bar.svelte";
export { default as SourceEditor } from "$lib/features/editor/ui/source_editor.svelte";
export type { EditorMode } from "$lib/features/editor/domain/editor_mode";
export type {
  EditorAiContext,
  EditorSelectionSnapshot,
} from "$lib/shared/types/editor";
export { extract_headings_from_markdown } from "$lib/features/editor/domain/extract_headings";
