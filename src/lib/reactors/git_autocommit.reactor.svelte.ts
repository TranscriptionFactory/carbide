import type { EditorStore } from "$lib/features/editor";
import type { GitStore } from "$lib/features/git";
import type { UIStore } from "$lib/app";
import type { GitService } from "$lib/features/git";
import { is_draft_note_path } from "$lib/features/note";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";

const ON_SAVE_DELAY_MS = 5_000;
const RETRY_DELAY_WHILE_COMMITTING_MS = 1_000;

export function create_git_autocommit_reactor(
  editor_store: EditorStore,
  git_store: GitStore,
  ui_store: UIStore,
  git_service: GitService,
): () => void {
  return $effect.root(() => {
    const dirty_paths = new Set<string>();
    const pending_paths = new Set<string>();

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
      const paths = Array.from(pending_paths);
      pending_paths.clear();
      void git_service.auto_commit(paths);
    };

    const commit = create_debounced_task_controller<void>({
      run: flush_commit,
    });

    const schedule_commit = (delay_ms: number) => {
      commit.schedule(undefined, delay_ms);
    };

    $effect(() => {
      if (git_store.enabled) return;
      commit.cancel();
      dirty_paths.clear();
      pending_paths.clear();
    });

    $effect(() => {
      if (!git_store.enabled) return;

      const mode = ui_store.editor_settings.git_autocommit_mode;
      if (mode === "off") return;

      const open_note = editor_store.open_note;
      if (!open_note) return;

      const path = open_note.meta.path;
      if (is_draft_note_path(path)) return;

      if (open_note.is_dirty) {
        dirty_paths.add(path);
        return;
      }
      if (!dirty_paths.has(path)) return;

      dirty_paths.delete(path);
      pending_paths.add(path);

      const delay_ms =
        mode === "on_save"
          ? ON_SAVE_DELAY_MS
          : ui_store.editor_settings.git_autocommit_interval_minutes * 60_000;
      schedule_commit(delay_ms);
    });

    return () => {
      commit.cancel();
      dirty_paths.clear();
      pending_paths.clear();
    };
  });
}
