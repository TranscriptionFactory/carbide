import type {
  GitSyncStatus,
  GitCommit,
  GitDiff,
} from "$lib/features/git/types/git";
import { LruCache } from "$lib/shared/utils/lru_cache";

export class GitStore {
  enabled = $state(false);
  branch = $state("main");
  is_dirty = $state(false);
  pending_files = $state(0);
  has_remote = $state(false);
  has_upstream = $state(false);
  remote_url = $state<string | null>(null);
  ahead = $state(0);
  behind = $state(0);
  sync_status = $state<GitSyncStatus>("idle");
  last_commit_time = $state<number | null>(null);
  error = $state<string | null>(null);

  history = $state<GitCommit[]>([]);
  history_note_path = $state<string | null>(null);
  history_limit = $state(0);
  has_more_history = $state(false);
  is_loading_history = $state(false);
  is_loading_more_history = $state(false);
  selected_commit = $state<GitCommit | null>(null);
  selected_diff = $state<GitDiff | null>(null);
  selected_file_content = $state<string | null>(null);
  is_loading_diff = $state(false);

  private readonly history_cache = new LruCache<
    string,
    {
      commits: GitCommit[];
      note_path: string | null;
      limit: number;
      has_more: boolean;
    }
  >(20);

  private history_key_for(note_path: string | null): string {
    return note_path ?? "__vault__";
  }

  set_status(
    branch: string,
    is_dirty: boolean,
    pending_files: number,
    has_remote: boolean,
    has_upstream: boolean,
    remote_url: string | null,
    ahead: number,
    behind: number,
  ) {
    this.branch = branch;
    this.is_dirty = is_dirty;
    this.pending_files = pending_files;
    this.has_remote = has_remote;
    this.has_upstream = has_upstream;
    this.remote_url = remote_url;
    this.ahead = ahead;
    this.behind = behind;
    this.history_cache.clear();
  }

  set_enabled(enabled: boolean) {
    this.enabled = enabled;
  }

  set_sync_status(status: GitSyncStatus) {
    this.sync_status = status;
  }

  set_last_commit_time(time: number) {
    this.last_commit_time = time;
  }

  set_error(error: string | null) {
    this.error = error;
  }

  set_history(
    commits: GitCommit[],
    note_path: string | null,
    options?: {
      limit?: number;
      has_more?: boolean;
      preserve_selection?: boolean;
    },
  ) {
    const history_limit = options?.limit ?? commits.length;
    const has_more_history = options?.has_more ?? false;
    const preserve_selection =
      options?.preserve_selection === true &&
      this.history_note_path === note_path &&
      this.selected_commit !== null;
    const selected_hash = preserve_selection
      ? this.selected_commit?.hash
      : null;
    const selected_commit =
      selected_hash === null
        ? null
        : (commits.find((commit) => commit.hash === selected_hash) ?? null);
    const cache_key = this.history_key_for(note_path);

    this.history = commits;
    this.history_note_path = note_path;
    this.history_limit = history_limit;
    this.has_more_history = has_more_history;
    if (selected_commit) {
      this.selected_commit = selected_commit;
    } else {
      this.selected_commit = null;
      this.selected_diff = null;
      this.selected_file_content = null;
    }

    this.is_loading_diff = false;

    this.history_cache.set(cache_key, {
      commits: [...commits],
      note_path,
      limit: history_limit,
      has_more: has_more_history,
    });
  }

  restore_history_from_cache(
    note_path: string | null,
    minimum_limit = 0,
  ): boolean {
    const cached = this.history_cache.get(this.history_key_for(note_path));
    if (!cached || cached.limit < minimum_limit) {
      return false;
    }

    this.set_history([...cached.commits], cached.note_path, {
      limit: cached.limit,
      has_more: cached.has_more,
    });
    return true;
  }

  set_loading_history(loading: boolean) {
    this.is_loading_history = loading;
  }

  set_loading_more_history(loading: boolean) {
    this.is_loading_more_history = loading;
  }

  set_selected_commit(
    commit: GitCommit | null,
    diff: GitDiff | null,
    file_content: string | null,
  ) {
    this.selected_commit = commit;
    this.selected_diff = diff;
    this.selected_file_content = file_content;
    this.is_loading_diff = false;
  }

  set_loading_diff(loading: boolean) {
    this.is_loading_diff = loading;
  }

  clear_history() {
    this.history = [];
    this.history_note_path = null;
    this.history_limit = 0;
    this.has_more_history = false;
    this.is_loading_history = false;
    this.is_loading_more_history = false;
    this.selected_commit = null;
    this.selected_diff = null;
    this.selected_file_content = null;
    this.is_loading_diff = false;
  }

  invalidate_history_cache() {
    this.history_cache.clear();
    this.clear_history();
  }

  reset() {
    this.enabled = false;
    this.branch = "main";
    this.is_dirty = false;
    this.pending_files = 0;
    this.has_remote = false;
    this.has_upstream = false;
    this.remote_url = null;
    this.ahead = 0;
    this.behind = 0;
    this.sync_status = "idle";
    this.last_commit_time = null;
    this.error = null;
    this.clear_history();
    this.history_cache.clear();
  }
}
