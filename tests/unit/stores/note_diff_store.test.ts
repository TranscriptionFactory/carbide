import { describe, expect, it } from "vitest";
import { NoteDiffStore } from "$lib/features/git/state/note_diff_store.svelte";
import type { GitDiff } from "$lib/features/git/types/git";

function make_diff(): GitDiff {
  return { additions: 1, deletions: 0, hunks: [] };
}

describe("NoteDiffStore", () => {
  it("starts with diff mode off and no content", () => {
    const store = new NoteDiffStore();
    expect(store.diff_mode).toBe(false);
    expect(store.diff_content).toBeNull();
    expect(store.diff_loading).toBe(false);
  });

  it("is visible only when the loaded diff path matches the active path", () => {
    const store = new NoteDiffStore();
    store.set_active_path("/note.md");
    const diff = make_diff();
    store.apply_diff(diff, "/note.md");

    expect(store.diff_mode).toBe(true);
    expect(store.diff_content).toBe(diff);
  });

  it("hides a diff loaded for a stale path", () => {
    const store = new NoteDiffStore();
    store.set_active_path("/note.md");
    store.apply_diff(make_diff(), "/other.md");

    expect(store.diff_mode).toBe(false);
    expect(store.diff_content).toBeNull();
  });

  it("resets loaded content when the active path changes", () => {
    const store = new NoteDiffStore();
    store.set_active_path("/note.md");
    store.apply_diff(make_diff(), "/note.md");
    expect(store.diff_mode).toBe(true);

    store.set_active_path("/next.md");
    expect(store.diff_mode).toBe(false);
    expect(store.diff_content).toBeNull();
  });
});
