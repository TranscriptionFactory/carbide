import type { EditorStore } from "$lib/features/editor";
import type { GitStore } from "$lib/features/git";
import type { UIStore } from "$lib/app";
import type { GitService } from "$lib/features/git";
import type { NotesStore } from "$lib/features/note";
import { is_draft_note_path } from "$lib/features/note";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";

const ON_SAVE_DELAY_MS = 5_000;
const RETRY_DELAY_WHILE_COMMITTING_MS = 1_000;

export function create_git_autocommit_reactor(
  editor_store: EditorStore,
  notes_store: NotesStore,
  git_store: GitStore,
  ui_store: UIStore,
  git_service: GitService,
): () => void {
  return $effect.root(() => {
    const dirty_paths = new Set<string>();
    const pending_paths = new Set<string>();
    let last_seen_path: string | null = null;

    const vault_has_note = (path: string) =>
      notes_store.notes.some((note) => note.path === path);

    const flush_commit = () => {
      if (!git_store.enabled) {
        pending_paths.clear();
        return;
      }
      if (pending_paths.size === 0) {
        return;
      }
      if (git_store.sync_status === "committing") {
        schedule_commit(RETRY_DELAY_WHILE_COMMITTING_MS);
        return;
      }
      // The queue holds path strings captured up to 5 s ago. Anything the vault
      // no longer knows about is stale, and staging it would ask git to resolve
      // a path with no file — which is how an "Update:" became a deletion.
      const paths = Array.from(pending_paths).filter(vault_has_note);
      pending_paths.clear();
      if (paths.length === 0) {
        return;
      }
      void git_service.auto_commit(paths);
    };

    const commit = create_debounced_task_controller<void>({
      run: flush_commit,
    });

    const schedule_commit = (delay_ms: number) => {
      commit.schedule(undefined, delay_ms);
    };

    const schedule_interval_commit = (delay_ms: number) => {
      commit.schedule_if_idle(undefined, delay_ms);
    };

    $effect(() => {
      if (git_store.enabled) return;
      commit.cancel();
      dirty_paths.clear();
      pending_paths.clear();
      last_seen_path = null;
    });

    // A rename moves the open note without producing a dirty→clean edge, so the
    // queued string dangles and the new path is never queued at all — leaving it
    // untracked, which is what makes a later "Discard All" delete it outright.
    const follow_rename = (from: string, to: string) => {
      if (vault_has_note(from)) return;
      if (dirty_paths.delete(from)) {
        dirty_paths.add(to);
      }
      if (pending_paths.delete(from)) {
        pending_paths.add(to);
      }
    };

    $effect(() => {
      if (!git_store.enabled) return;

      const mode = ui_store.editor_settings.git_autocommit_mode;
      if (mode === "off") return;

      const open_note = editor_store.open_note;
      if (!open_note) return;

      const path = open_note.meta.path;
      if (is_draft_note_path(path)) return;

      const previous_path = last_seen_path;
      last_seen_path = path;
      if (previous_path !== null && previous_path !== path) {
        follow_rename(previous_path, path);
      }

      if (open_note.is_dirty) {
        dirty_paths.add(path);
        return;
      }
      if (!dirty_paths.has(path)) return;

      dirty_paths.delete(path);
      pending_paths.add(path);

      if (mode === "on_save") {
        schedule_commit(ON_SAVE_DELAY_MS);
        return;
      }
      schedule_interval_commit(
        ui_store.editor_settings.git_autocommit_interval_minutes * 60_000,
      );
    });

    return () => {
      commit.cancel();
      dirty_paths.clear();
      pending_paths.clear();
    };
  });
}
