import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { NoteDiffService } from "$lib/features/git/application/note_diff_service";
import type { GitDiff } from "$lib/features/git/types/git";

type LoadDiff = (path: string) => Promise<GitDiff>;
type LoadDiffAtCommit = (path: string, commit_hash: string) => Promise<GitDiff>;

function make_diff(label: string): GitDiff {
  return { additions: 1, deletions: 0, hunks: [{ header: label, lines: [] }] };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("NoteDiffService", () => {
  let load_diff: Mock<LoadDiff>;
  let load_diff_at_commit: Mock<LoadDiffAtCommit>;

  beforeEach(() => {
    load_diff = vi.fn<LoadDiff>();
    load_diff_at_commit = vi.fn<LoadDiffAtCommit>();
  });

  function make_service(active_path: string | null = "/note.md") {
    const service = new NoteDiffService({ load_diff, load_diff_at_commit });
    service.set_active_path(active_path);
    return service;
  }

  async function expect_load_error(action: "toggle" | "commit") {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = make_service();

    if (action === "toggle") {
      load_diff.mockRejectedValue(new Error("network"));
      await service.toggle();
    } else {
      load_diff_at_commit.mockRejectedValue(new Error("fail"));
      await service.view_commit_diff("abc123");
    }

    expect(service.diff_mode).toBe(false);
    expect(service.diff_loading).toBe(false);
    warn.mockRestore();
  }

  async function expect_pending_request_loaded(options: {
    content: GitDiff;
    request_id: number;
    commit_hash?: string;
  }) {
    const { content, request_id, commit_hash = "" } = options;
    const on_pending_handled = vi.fn();

    if (commit_hash) {
      load_diff_at_commit.mockResolvedValue(content);
    } else {
      load_diff.mockResolvedValue(content);
    }

    const service = new NoteDiffService({
      load_diff,
      load_diff_at_commit,
      on_pending_handled,
    });
    service.set_active_path("/note.md");
    service.handle_pending_request({
      request_id,
      path: "/note.md",
      commit_hash,
    });
    await flush();

    if (commit_hash) {
      expect(load_diff_at_commit).toHaveBeenCalledWith("/note.md", commit_hash);
    } else {
      expect(load_diff).toHaveBeenCalledWith("/note.md");
      expect(load_diff_at_commit).not.toHaveBeenCalled();
    }
    expect(service.diff_mode).toBe(true);
    expect(service.diff_content).toBe(content);
    expect(on_pending_handled).toHaveBeenCalledWith(request_id);
  }

  it("starts with diff mode off", () => {
    const service = make_service();
    expect(service.diff_mode).toBe(false);
    expect(service.diff_content).toBeNull();
    expect(service.diff_loading).toBe(false);
  });

  it("toggles diff mode on and loads content", async () => {
    const content = make_diff("working");
    load_diff.mockResolvedValue(content);
    const service = make_service();

    await service.toggle();

    expect(load_diff).toHaveBeenCalledWith("/note.md");
    expect(service.diff_mode).toBe(true);
    expect(service.diff_content).toBe(content);
    expect(service.diff_loading).toBe(false);
  });

  it("toggles diff mode off when already on", async () => {
    load_diff.mockResolvedValue(make_diff("working"));
    const service = make_service();

    await service.toggle();
    expect(service.diff_mode).toBe(true);

    await service.toggle();
    expect(service.diff_mode).toBe(false);
    expect(service.diff_content).toBeNull();
  });

  it("does nothing when the active path is null", async () => {
    const service = make_service(null);

    await service.toggle();

    expect(load_diff).not.toHaveBeenCalled();
    expect(service.diff_mode).toBe(false);
  });

  it("does nothing when no working-tree loader is provided", async () => {
    const service = new NoteDiffService({ load_diff_at_commit });
    service.set_active_path("/note.md");

    await service.toggle();
    expect(service.diff_mode).toBe(false);
  });

  it("resets diff state when the active path changes", async () => {
    load_diff.mockResolvedValue(make_diff("working"));
    const service = make_service("/note-a.md");

    await service.toggle();
    expect(service.diff_mode).toBe(true);

    service.set_active_path("/note-b.md");
    expect(service.diff_mode).toBe(false);
    expect(service.diff_content).toBeNull();
  });

  it("handles a working-tree load error gracefully", async () => {
    await expect_load_error("toggle");
  });

  it("loads a diff at a specific commit", async () => {
    const content = make_diff("commit");
    load_diff_at_commit.mockResolvedValue(content);
    const service = make_service();

    await service.view_commit_diff("abc123");

    expect(load_diff_at_commit).toHaveBeenCalledWith("/note.md", "abc123");
    expect(service.diff_mode).toBe(true);
    expect(service.diff_content).toBe(content);
  });

  it("does not reopen diff mode when a later commit diff resolves after returning to the note", async () => {
    let resolve_second: (value: GitDiff) => void = () => {};
    load_diff_at_commit
      .mockResolvedValueOnce(make_diff("first"))
      .mockImplementationOnce(
        () =>
          new Promise<GitDiff>((resolve) => {
            resolve_second = resolve;
          }),
      );
    const service = make_service();

    await service.view_commit_diff("first");
    expect(service.diff_mode).toBe(true);

    void service.view_commit_diff("second");
    expect(load_diff_at_commit).toHaveBeenCalledWith("/note.md", "second");

    await service.toggle();
    expect(service.diff_mode).toBe(false);

    resolve_second(make_diff("second"));
    await flush();

    expect(service.diff_mode).toBe(false);
    expect(service.diff_content).toBeNull();
  });

  it("skips commit diff when no loader is provided", async () => {
    const service = new NoteDiffService({ load_diff });
    service.set_active_path("/note.md");

    await service.view_commit_diff("abc123");
    expect(service.diff_mode).toBe(false);
  });

  it("handles a commit diff load error gracefully", async () => {
    await expect_load_error("commit");
  });

  it("loads a pending commit diff request when the matching tab is active", async () => {
    await expect_pending_request_loaded({
      content: make_diff("pulse"),
      request_id: 7,
      commit_hash: "abc123",
    });
  });

  it("loads a pending working-tree diff request when the matching tab is active", async () => {
    await expect_pending_request_loaded({
      content: make_diff("working-tree"),
      request_id: 9,
    });
  });

  it("ignores pending commit diff requests for a different path", async () => {
    const on_pending_handled = vi.fn();

    const service = new NoteDiffService({
      load_diff_at_commit,
      on_pending_handled,
    });
    service.set_active_path("/note.md");
    service.handle_pending_request({
      request_id: 8,
      path: "/other.md",
      commit_hash: "abc123",
    });
    await flush();

    expect(load_diff_at_commit).not.toHaveBeenCalled();
    expect(on_pending_handled).not.toHaveBeenCalled();
  });
});
