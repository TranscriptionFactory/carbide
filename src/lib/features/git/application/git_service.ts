import type { GitPort } from "$lib/features/git/ports";
import type { VaultStore } from "$lib/features/vault";
import type { GitStore } from "$lib/features/git/state/git_store.svelte";
import type { OpStore } from "$lib/app";
import type { GitPullStrategy } from "$lib/shared/types/editor_settings";
import type { VaultPath } from "$lib/shared/types/ids";
import { error_message } from "$lib/shared/utils/error_message";

type CommitRunResult =
  | { status: "committed" }
  | { status: "skipped" }
  | { status: "no_repo" }
  | { status: "failed"; error: string };

export type GitInitResult =
  | { status: "initialized" }
  | { status: "already_repo" }
  | { status: "failed"; error: string };

export type GitCheckpointResult =
  | { status: "created" }
  | { status: "skipped" }
  | { status: "no_repo" }
  | { status: "failed"; error: string }
  | { status: "created"; warning: string };

export class GitService {
  constructor(
    private readonly git_port: GitPort,
    private readonly vault_store: VaultStore,
    private readonly git_store: GitStore,
    private readonly op_store: OpStore,
    private readonly now_ms: () => number,
  ) {}

  private get_vault_path(): VaultPath {
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) throw new Error("No vault open");
    return vault_path;
  }

  private format_auto_commit_message(paths: string[]): string {
    const timestamp = new Date(this.now_ms()).toISOString();
    const unique_titles = Array.from(
      new Set(paths.map((path) => this.extract_note_title(path))),
    );
    if (unique_titles.length === 0) {
      return `Update: workspace (${timestamp})`;
    }
    if (unique_titles.length === 1) {
      const only_title = unique_titles[0] ?? "workspace";
      return `Update: ${only_title} (${timestamp})`;
    }
    if (unique_titles.length <= 3) {
      return `Update: ${unique_titles.join(", ")} (${timestamp})`;
    }
    const head = unique_titles.slice(0, 3).join(", ");
    return `Update: ${head} +${String(unique_titles.length - 3)} more (${timestamp})`;
  }

  private extract_note_title(path: string): string {
    return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
  }

  private format_checkpoint_tag(description: string): string {
    const normalized = description
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    const base = normalized || "checkpoint";
    return `checkpoint-${base}-${String(this.now_ms())}`;
  }

  private is_nothing_to_commit_error(error: unknown): boolean {
    const text = error_message(error).toLowerCase();
    return text.includes("nothing to commit");
  }

  private fail_when_no_repository(op_key: string): CommitRunResult {
    this.op_store.start(op_key, this.now_ms());
    this.op_store.fail(op_key, "No git repository");
    return { status: "no_repo" };
  }

  private begin_git_mutation(op_key: string): void {
    this.op_store.start(op_key, this.now_ms());
    this.git_store.set_sync_status("committing");
    this.git_store.set_error(null);
  }

  private async finish_git_mutation_success(
    op_key: string,
    options?: {
      track_last_commit?: boolean;
      invalidate_history_cache?: boolean;
    },
  ): Promise<void> {
    this.git_store.set_sync_status("idle");
    if (options?.track_last_commit) {
      this.git_store.set_last_commit_time(this.now_ms());
    }
    if (options?.invalidate_history_cache) {
      this.git_store.invalidate_history_cache();
    }
    this.op_store.succeed(op_key);
    await this.refresh_status();
  }

  private fail_git_mutation(op_key: string, error: string): void {
    this.git_store.set_sync_status("error");
    this.git_store.set_error(error);
    this.op_store.fail(op_key, error);
  }

  private async run_commit(
    op_key: string,
    message: string,
    files: string[] | null,
  ): Promise<CommitRunResult> {
    const vault_path = this.get_vault_path();
    const has_repo = await this.git_port.has_repo(vault_path);
    if (!has_repo) {
      return this.fail_when_no_repository(op_key);
    }

    this.begin_git_mutation(op_key);

    try {
      const status = await this.git_port.status(vault_path);
      if (!status.is_dirty) {
        await this.finish_git_mutation_success(op_key);
        return { status: "skipped" };
      }

      await this.git_port.stage_and_commit(vault_path, message, files);
      await this.finish_git_mutation_success(op_key, {
        track_last_commit: true,
        invalidate_history_cache: true,
      });
      return { status: "committed" };
    } catch (err) {
      if (this.is_nothing_to_commit_error(err)) {
        await this.finish_git_mutation_success(op_key);
        return { status: "skipped" };
      }
      const msg = error_message(err);
      this.fail_git_mutation(op_key, msg);
      return { status: "failed", error: msg };
    }
  }

  async check_repo() {
    try {
      const vault_path = this.get_vault_path();
      const has_repo = await this.git_port.has_repo(vault_path);
      this.git_store.set_enabled(has_repo);
      if (has_repo) {
        await this.refresh_status();
      }
    } catch {
      this.git_store.set_enabled(false);
    }
  }

  async get_git_info_for_path(
    vault_path: VaultPath,
  ): Promise<{ branch: string; is_dirty: boolean } | null> {
    try {
      const has_repo = await this.git_port.has_repo(vault_path);
      if (!has_repo) return null;
      const status = await this.git_port.status(vault_path);
      return { branch: status.branch, is_dirty: status.is_dirty };
    } catch {
      return null;
    }
  }

  async init_repo(): Promise<GitInitResult> {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.init", this.now_ms());
    this.git_store.set_error(null);
    try {
      const has_repo = await this.git_port.has_repo(vault_path);
      if (has_repo) {
        this.git_store.set_enabled(true);
        this.op_store.succeed("git.init");
        await this.refresh_status();
        return { status: "already_repo" };
      }
      await this.git_port.init_repo(vault_path);
      this.git_store.set_enabled(true);
      this.op_store.succeed("git.init");
      await this.refresh_status();
      return { status: "initialized" };
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      this.op_store.fail("git.init", msg);
      return { status: "failed", error: msg };
    }
  }

  async refresh_status() {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.status", this.now_ms());
    try {
      const status = await this.git_port.status(vault_path);
      this.git_store.set_status(
        status.branch,
        status.is_dirty,
        status.files.length,
        status.has_remote,
        status.has_upstream,
        status.remote_url,
        status.ahead,
        status.behind,
      );
      this.op_store.succeed("git.status");
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      this.op_store.fail("git.status", msg);
    }
  }

  async auto_commit(paths: string[]) {
    const message = this.format_auto_commit_message(paths);
    const commit_paths = paths.length > 0 ? paths : null;
    await this.run_commit("git.commit", message, commit_paths);
  }

  async commit_all() {
    const timestamp = new Date(this.now_ms()).toISOString();
    await this.run_commit("git.commit", `Update: manual (${timestamp})`, null);
  }

  async create_checkpoint(description: string): Promise<GitCheckpointResult> {
    const message = `Checkpoint: ${description}`;
    const result = await this.run_commit("git.checkpoint", message, null);
    if (result.status === "no_repo") {
      return { status: "no_repo" };
    }
    if (result.status === "skipped") {
      return { status: "skipped" };
    }
    if (result.status === "failed") {
      return { status: "failed", error: result.error };
    }

    try {
      const vault_path = this.get_vault_path();
      const tag_name = this.format_checkpoint_tag(description);
      await this.git_port.create_tag(vault_path, tag_name, message);
      return { status: "created" };
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      return { status: "created", warning: msg };
    }
  }

  async load_history(note_path: string | null, limit: number) {
    if (this.git_store.restore_history_from_cache(note_path, limit)) {
      return;
    }

    const vault_path = this.get_vault_path();
    this.op_store.start("git.history", this.now_ms());
    this.git_store.set_loading_history(true);
    try {
      const commits = await this.git_port.log(vault_path, note_path, limit);
      this.git_store.set_history(commits, note_path, {
        limit,
        has_more: commits.length >= limit,
      });
      this.op_store.succeed("git.history");
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      this.op_store.fail("git.history", msg);
    } finally {
      this.git_store.set_loading_history(false);
    }
  }

  async load_more_history(note_path: string | null, page_size = 20) {
    if (
      this.git_store.is_loading_history ||
      this.git_store.is_loading_more_history
    ) {
      return;
    }

    if (this.git_store.history_note_path !== note_path) {
      await this.load_history(note_path, page_size);
      return;
    }

    if (!this.git_store.has_more_history) {
      return;
    }

    const next_limit = this.git_store.history_limit + page_size;
    const vault_path = this.get_vault_path();
    this.op_store.start("git.history_more", this.now_ms());
    this.git_store.set_loading_more_history(true);
    try {
      const commits = await this.git_port.log(
        vault_path,
        note_path,
        next_limit,
      );
      this.git_store.set_history(commits, note_path, {
        limit: next_limit,
        has_more: commits.length >= next_limit,
        preserve_selection: true,
      });
      this.op_store.succeed("git.history_more");
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      this.op_store.fail("git.history_more", msg);
    } finally {
      this.git_store.set_loading_more_history(false);
    }
  }

  async get_diff(commit_a: string, commit_b: string, file_path: string | null) {
    const vault_path = this.get_vault_path();
    return await this.git_port.diff(vault_path, commit_a, commit_b, file_path);
  }

  async get_file_at_commit(file_path: string, commit_hash: string) {
    const vault_path = this.get_vault_path();
    return await this.git_port.show_file_at_commit(
      vault_path,
      file_path,
      commit_hash,
    );
  }

  async restore_version(file_path: string, commit_hash: string) {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.restore", this.now_ms());
    this.git_store.set_sync_status("committing");
    try {
      await this.git_port.restore_file(vault_path, file_path, commit_hash);
      await this.finish_git_mutation_success("git.restore", {
        track_last_commit: true,
        invalidate_history_cache: true,
      });
    } catch (err) {
      if (this.is_nothing_to_commit_error(err)) {
        await this.finish_git_mutation_success("git.restore");
        return;
      }
      const msg = error_message(err);
      this.fail_git_mutation("git.restore", msg);
    }
  }

  async push() {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.push", this.now_ms());
    this.git_store.set_sync_status("pushing");
    this.git_store.set_error(null);
    try {
      const status = await this.git_port.status(vault_path);
      const result = status.has_upstream
        ? await this.git_port.push(vault_path)
        : await this.git_port.push_with_upstream(vault_path, status.branch);
      if (!result.success) {
        this.fail_git_mutation("git.push", result.error ?? "Push failed");
        return result;
      }
      this.git_store.set_sync_status("idle");
      this.op_store.succeed("git.push");
      await this.refresh_status();
      return result;
    } catch (err) {
      const msg = error_message(err);
      this.fail_git_mutation("git.push", msg);
      return { success: false, message: null, error: msg };
    }
  }

  async pull(strategy: GitPullStrategy = "merge") {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.pull", this.now_ms());
    this.git_store.set_sync_status("pulling");
    this.git_store.set_error(null);
    try {
      const result = await this.git_port.pull(vault_path, strategy);
      if (!result.success) {
        this.fail_git_mutation("git.pull", result.error ?? "Pull failed");
        return result;
      }
      this.git_store.set_sync_status("idle");
      this.git_store.invalidate_history_cache();
      this.op_store.succeed("git.pull");
      await this.refresh_status();
      return result;
    } catch (err) {
      const msg = error_message(err);
      this.fail_git_mutation("git.pull", msg);
      return { success: false, message: null, error: msg };
    }
  }

  async fetch_remote() {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.fetch", this.now_ms());
    this.git_store.set_sync_status("fetching");
    this.git_store.set_error(null);
    try {
      const result = await this.git_port.fetch(vault_path);
      if (!result.success) {
        this.git_store.set_sync_status("error");
        this.git_store.set_error(result.error ?? "Fetch failed");
        this.op_store.fail("git.fetch", result.error ?? "Fetch failed");
        return result;
      }
      this.git_store.set_sync_status("idle");
      this.op_store.succeed("git.fetch");
      await this.refresh_status();
      return result;
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_sync_status("error");
      this.git_store.set_error(msg);
      this.op_store.fail("git.fetch", msg);
      return { success: false, message: null, error: msg };
    }
  }

  async add_remote(url: string) {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.add_remote", this.now_ms());
    this.git_store.set_error(null);
    try {
      const result = await this.git_port.add_remote(vault_path, url);
      if (!result.success) {
        this.git_store.set_error(result.error);
        this.op_store.fail(
          "git.add_remote",
          result.error ?? "Failed to add remote",
        );
        return result;
      }
      this.op_store.succeed("git.add_remote");
      await this.refresh_status();
      return result;
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      this.op_store.fail("git.add_remote", msg);
      return { success: false, message: null, error: msg };
    }
  }

  async set_remote_url(url: string) {
    const vault_path = this.get_vault_path();
    this.op_store.start("git.set_remote_url", this.now_ms());
    this.git_store.set_error(null);
    try {
      const result = await this.git_port.set_remote_url(vault_path, url);
      if (!result.success) {
        this.git_store.set_error(result.error);
        this.op_store.fail(
          "git.set_remote_url",
          result.error ?? "Failed to update remote URL",
        );
        return result;
      }
      this.op_store.succeed("git.set_remote_url");
      await this.refresh_status();
      return result;
    } catch (err) {
      const msg = error_message(err);
      this.git_store.set_error(msg);
      this.op_store.fail("git.set_remote_url", msg);
      return { success: false, message: null, error: msg };
    }
  }

  async sync(strategy: GitPullStrategy = "merge") {
    const vault_path = this.get_vault_path();
    const status = await this.git_port.status(vault_path);
    if (!status.has_remote) {
      return { success: false, message: null, error: "No remote configured" };
    }

    if (status.is_dirty) {
      await this.commit_all();
    }

    const pull_result = await this.pull(strategy);
    if (!pull_result.success) return pull_result;

    return await this.push();
  }
}
