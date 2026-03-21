import { describe, expect, it } from "vitest";
import { GitStore } from "$lib/features/git/state/git_store.svelte";
import type { GitCommit } from "$lib/features/git/types/git";

function make_commit(hash: string): GitCommit {
  return {
    hash,
    short_hash: hash.slice(0, 3),
    author: "test",
    timestamp_ms: 1000,
    message: `commit ${hash}`,
  };
}

describe("GitStore history_cache invalidation", () => {
  it("clears history_cache when set_status is called", () => {
    const store = new GitStore();

    store.set_history([make_commit("abc123")], "notes/test.md", {
      limit: 20,
      has_more: false,
    });

    store.set_status("main", false, 0, false, false, null, 0, 0);

    expect(store.restore_history_from_cache("notes/test.md", 0)).toBe(false);
  });

  it("clears vault-level cache entry when set_status is called", () => {
    const store = new GitStore();

    store.set_history([make_commit("def456")], null, {
      limit: 50,
      has_more: true,
    });

    store.set_status("feature/x", true, 2, true, false, null, 1, 0);

    expect(store.restore_history_from_cache(null, 0)).toBe(false);
  });

  it("restore_history_from_cache returns false after set_status even when cache had multiple entries", () => {
    const store = new GitStore();

    store.set_history([make_commit("aaa")], "notes/a.md", {
      limit: 10,
      has_more: false,
    });
    store.set_history([make_commit("bbb")], "notes/b.md", {
      limit: 10,
      has_more: false,
    });

    store.set_status("main", false, 0, false, false, null, 0, 0);

    expect(store.restore_history_from_cache("notes/a.md", 0)).toBe(false);
    expect(store.restore_history_from_cache("notes/b.md", 0)).toBe(false);
  });

  it("populates cache again after set_status when new history is loaded", () => {
    const store = new GitStore();
    const commits = [make_commit("abc123")];

    store.set_history(commits, "notes/test.md", { limit: 20, has_more: false });
    store.set_status("main", false, 0, false, false, null, 0, 0);
    store.set_history(commits, "notes/test.md", { limit: 20, has_more: false });

    expect(store.restore_history_from_cache("notes/test.md", 20)).toBe(true);
  });
});
