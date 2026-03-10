import type { UIStore } from "$lib/app";
import type { GitStore } from "$lib/features/git";
import type { GitService } from "$lib/features/git";

export function create_git_auto_fetch_reactor(
  git_store: GitStore,
  ui_store: UIStore,
  git_service: GitService,
): () => void {
  return $effect.root(() => {
    $effect(() => {
      if (!git_store.enabled || !git_store.has_remote) {
        return;
      }

      const interval_minutes =
        ui_store.editor_settings.git_auto_fetch_interval_minutes;
      if (interval_minutes <= 0) {
        return;
      }

      const handle = setInterval(() => {
        if (!git_store.enabled || !git_store.has_remote) {
          return;
        }
        if (git_store.sync_status !== "idle") {
          return;
        }
        void git_service.fetch_remote();
      }, interval_minutes * 60_000);

      return () => {
        clearInterval(handle);
      };
    });
  });
}
