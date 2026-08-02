import { paths_equal_ignore_case } from "$lib/shared/utils/path";

export type AgentNoteSyncAction =
  | "reload"
  | "mark_conflict"
  | "invalidate_tab_cache"
  | "ignore";

export type SyncOpenNote = { path: string; is_dirty: boolean };
export type SyncBackgroundTab = { is_dirty: boolean };

// Agent edits land on disk directly, so the same reload/conflict rules the
// watcher applies to external writes have to be applied here — the watcher's
// own event for the write may have been suppressed as a self-write.
export function resolve_agent_note_sync(
  changed_path: string,
  open_note: SyncOpenNote | null,
  background_tab: SyncBackgroundTab | null,
): AgentNoteSyncAction {
  if (open_note && paths_equal_ignore_case(changed_path, open_note.path)) {
    return open_note.is_dirty ? "mark_conflict" : "reload";
  }
  if (background_tab) {
    return background_tab.is_dirty ? "mark_conflict" : "invalidate_tab_cache";
  }
  return "ignore";
}
