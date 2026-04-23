export { register_git_actions } from "$lib/features/git/application/git_actions";
export { GitService } from "$lib/features/git/application/git_service";
export { GitStore } from "$lib/features/git/state/git_store.svelte";
export type { GitPort } from "$lib/features/git/ports";
export { create_git_tauri_adapter } from "$lib/features/git/adapters/git_tauri_adapter";
export { default as GitStatusWidget } from "$lib/features/git/ui/git_status_widget.svelte";
export { default as VersionHistoryDialog } from "$lib/features/git/ui/version_history_dialog.svelte";
export { default as CheckpointDialog } from "$lib/features/git/ui/checkpoint_dialog.svelte";
export { default as AddRemoteDialog } from "$lib/features/git/ui/add_remote_dialog.svelte";
export { default as DiffViewerDialog } from "$lib/features/git/ui/diff_viewer_dialog.svelte";
export { default as SourceControlPanel } from "$lib/features/git/ui/source_control_panel.svelte";
export {
  CHECKPOINT_PREFIX,
  type GitSyncStatus,
  type GitStatus,
  type GitCommit,
  type GitDiff,
  type GitRemoteResult,
} from "$lib/features/git/types/git";
