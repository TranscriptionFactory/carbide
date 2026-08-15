import { paths_equal_ignore_case } from "$lib/shared/utils/path";

export type AgentNoteSyncAction =
  | "reload"
  | "mark_saved"
  | "mark_conflict"
  | "invalidate_tab_cache"
  | "ignore";

// `matches_disk` is what separates a conflict from a save. An inline AI accept
// writes the buffer's own text: the editor still calls that buffer dirty, but
// disk already holds it, so warning the user about a divergence that does not
// exist is as wrong as reloading text the buffer is already showing.
export type SyncOpenNote = {
  path: string;
  is_dirty: boolean;
  matches_disk: boolean;
};
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
    if (open_note.matches_disk) {
      return open_note.is_dirty ? "mark_saved" : "ignore";
    }
    return open_note.is_dirty ? "mark_conflict" : "reload";
  }
  if (background_tab) {
    return background_tab.is_dirty ? "mark_conflict" : "invalidate_tab_cache";
  }
  return "ignore";
}
