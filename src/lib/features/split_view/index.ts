export { SplitViewStore } from "$lib/features/split_view/state/split_view_store.svelte";
export { SplitViewService } from "$lib/features/split_view/application/split_view_service";
export { register_split_view_actions } from "$lib/features/split_view/application/split_view_actions";
export type { ActivePane } from "$lib/features/split_view/state/split_view_store.svelte";
export { default as SplitNoteEditor } from "$lib/features/split_view/ui/split_note_editor.svelte";
export { default as SplitDropZone } from "$lib/features/split_view/ui/split_drop_zone.svelte";
export {
  resolve_content_sync,
  normalize_for_comparison,
} from "$lib/features/split_view/domain/content_sync";
export type {
  SyncDirection,
  SyncResult,
  ContentSyncInput,
} from "$lib/features/split_view/domain/content_sync";
