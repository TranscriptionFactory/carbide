export { register_tab_actions } from "$lib/features/tab/application/tab_actions";
export { TabService } from "$lib/features/tab/application/tab_service";
export { SecondaryEditorManager } from "$lib/features/tab/application/secondary_editor_manager";
export {
  capture_active_tab_snapshot,
  ensure_tab_capacity,
  try_open_tab,
} from "$lib/features/tab/application/tab_action_helpers";
export { TabStore } from "$lib/features/tab/state/tab_store.svelte";
export { default as TabBar } from "$lib/features/tab/ui/tab_bar.svelte";
export { default as TabCloseConfirmDialog } from "$lib/features/tab/ui/tab_close_confirm_dialog.svelte";
export { default as SecondaryNoteEditor } from "$lib/features/tab/ui/secondary_note_editor.svelte";
export { default as SplitDropZone } from "$lib/features/tab/ui/split_drop_zone.svelte";
export type {
  Tab,
  TabId,
  Pane,
  PersistedTab,
  PersistedTabState,
  ClosedTabEntry,
} from "$lib/features/tab/types/tab";
