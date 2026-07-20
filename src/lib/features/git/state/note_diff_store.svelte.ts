import type { GitDiff } from "$lib/features/git/types/git";

export class NoteDiffStore {
  private mode = $state(false);
  private content = $state<GitDiff | null>(null);
  private path = $state<string | null>(null);

  active_path = $state<string | null>(null);
  loading = $state(false);

  get diff_mode(): boolean {
    return this.mode && this.path === this.active_path;
  }

  get diff_content(): GitDiff | null {
    return this.diff_mode ? this.content : null;
  }

  get diff_loading(): boolean {
    return this.loading;
  }

  set_active_path(path: string | null) {
    this.active_path = path;
    this.reset();
  }

  reset() {
    this.path = this.active_path;
    this.mode = false;
    this.content = null;
    this.loading = false;
  }

  set_loading(value: boolean) {
    this.loading = value;
  }

  apply_diff(diff: GitDiff, path: string) {
    this.content = diff;
    this.path = path;
    this.mode = true;
  }
}
