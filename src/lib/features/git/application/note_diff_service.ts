import type { GitDiff } from "$lib/features/git/types/git";
import { NoteDiffStore } from "$lib/features/git/state/note_diff_store.svelte";

export interface CommitDiffRequest {
  request_id: number;
  path: string;
  commit_hash?: string | null;
}

export interface NoteDiffLoaders {
  load_diff?: (path: string) => Promise<GitDiff>;
  load_diff_at_commit?: (path: string, commit_hash: string) => Promise<GitDiff>;
  on_pending_handled?: (request_id: number) => void;
}

type Cancellation = { cancelled: boolean };

export class NoteDiffService {
  private readonly store = new NoteDiffStore();
  private active_load: Cancellation | null = null;

  private readonly load_diff: ((path: string) => Promise<GitDiff>) | undefined;
  private readonly load_diff_at_commit:
    | ((path: string, commit_hash: string) => Promise<GitDiff>)
    | undefined;
  private readonly on_pending_handled:
    | ((request_id: number) => void)
    | undefined;

  constructor(loaders: NoteDiffLoaders = {}) {
    this.load_diff = loaders.load_diff;
    this.load_diff_at_commit = loaders.load_diff_at_commit;
    this.on_pending_handled = loaders.on_pending_handled;
  }

  get diff_mode(): boolean {
    return this.store.diff_mode;
  }

  get diff_content(): GitDiff | null {
    return this.store.diff_content;
  }

  get diff_loading(): boolean {
    return this.store.diff_loading;
  }

  set_active_path(path: string | null) {
    if (path === this.store.active_path) return;
    this.cancel_active_load();
    this.store.set_active_path(path);
  }

  async toggle() {
    if (this.store.diff_mode) {
      this.cancel_active_load();
      this.store.reset();
      return;
    }
    const path = this.store.active_path;
    if (!path || !this.load_diff) return;
    const cancellation = this.create_cancellation();
    try {
      await this.load_into_store(path, this.load_diff(path), cancellation);
    } finally {
      this.clear_cancellation(cancellation);
    }
  }

  async view_commit_diff(commit_hash: string) {
    const path = this.store.active_path;
    if (!path || !this.load_diff_at_commit) return;
    const cancellation = this.create_cancellation();
    try {
      await this.load_into_store(
        path,
        this.load_diff_at_commit(path, commit_hash),
        cancellation,
      );
    } finally {
      this.clear_cancellation(cancellation);
    }
  }

  handle_pending_request(request: CommitDiffRequest | null): () => void {
    const noop = () => {};
    if (!request || request.path !== this.store.active_path) return noop;

    const has_hash =
      typeof request.commit_hash === "string" && request.commit_hash.length > 0;
    if (has_hash && !this.load_diff_at_commit) {
      this.on_pending_handled?.(request.request_id);
      return noop;
    }
    if (!has_hash && !this.load_diff) {
      this.on_pending_handled?.(request.request_id);
      return noop;
    }

    const cancellation: Cancellation = { cancelled: false };
    const diff = has_hash
      ? this.load_diff_at_commit!(request.path, request.commit_hash as string)
      : this.load_diff!(request.path);

    void this.load_into_store(request.path, diff, cancellation).finally(() => {
      if (!cancellation.cancelled)
        this.on_pending_handled?.(request.request_id);
    });

    return () => {
      cancellation.cancelled = true;
    };
  }

  dispose() {
    this.cancel_active_load();
  }

  private async load_into_store(
    path: string,
    diff: Promise<GitDiff>,
    cancellation: Cancellation,
  ) {
    if (!cancellation.cancelled) this.store.set_loading(true);
    try {
      const resolved = await diff;
      if (!cancellation.cancelled) this.store.apply_diff(resolved, path);
    } catch (err) {
      console.warn("Failed to load diff:", err);
    } finally {
      if (!cancellation.cancelled) this.store.set_loading(false);
    }
  }

  private cancel_active_load() {
    if (!this.active_load) return;
    this.active_load.cancelled = true;
    this.active_load = null;
  }

  private create_cancellation(): Cancellation {
    this.cancel_active_load();
    const cancellation: Cancellation = { cancelled: false };
    this.active_load = cancellation;
    return cancellation;
  }

  private clear_cancellation(cancellation: Cancellation) {
    if (this.active_load === cancellation) this.active_load = null;
  }
}
