/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_git_autocommit_reactor } from "$lib/reactors/git_autocommit.reactor.svelte";
import {
  create_editor_store,
  create_git_store,
  create_notes_store,
  create_ui_store,
  type AutocommitMode,
} from "./fixtures/git_autocommit_stores.svelte";

const ON_SAVE_DELAY_MS = 5_000;

type HarnessOptions = {
  enabled?: boolean;
  mode?: AutocommitMode;
  interval_minutes?: number;
  initial_path?: string;
  vault_paths?: string[];
};

function create_harness(options: HarnessOptions = {}) {
  const {
    enabled = true,
    mode = "on_save",
    interval_minutes = 5,
    initial_path = "notes/a.md",
    vault_paths = [initial_path],
  } = options;

  const editor_store = create_editor_store(initial_path);
  const notes_store = create_notes_store(vault_paths);
  const git_store = create_git_store(enabled);
  const ui_store = create_ui_store(mode, interval_minutes);
  const auto_commit = vi.fn().mockResolvedValue(undefined);

  const unmount = create_git_autocommit_reactor(
    editor_store as never,
    notes_store as never,
    git_store as never,
    ui_store as never,
    { auto_commit } as never,
  );
  flushSync();

  const save = (path: string) => {
    editor_store.open_note = { is_dirty: true, meta: { path } };
    flushSync();
    editor_store.open_note = { is_dirty: false, meta: { path } };
    flushSync();
  };

  const rename = (from: string, to: string) => {
    notes_store.notes = notes_store.notes.map((note) =>
      note.path === from ? { path: to } : note,
    );
    editor_store.open_note = { is_dirty: false, meta: { path: to } };
    flushSync();
  };

  return {
    editor_store,
    notes_store,
    git_store,
    ui_store,
    auto_commit,
    unmount,
    save,
    rename,
  };
}

describe("git_autocommit.reactor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("commits the saved path once the debounce elapses", () => {
    const { auto_commit, save, unmount } = create_harness();

    save("notes/a.md");
    expect(auto_commit).not.toHaveBeenCalled();

    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);

    expect(auto_commit).toHaveBeenCalledTimes(1);
    expect(auto_commit).toHaveBeenCalledWith(["notes/a.md"]);
    unmount();
  });

  it("coalesces saves inside one debounce window into a single commit", () => {
    const { auto_commit, save, unmount } = create_harness({
      vault_paths: ["notes/a.md", "notes/b.md"],
    });

    save("notes/a.md");
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS - 1);
    save("notes/b.md");
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);

    expect(auto_commit).toHaveBeenCalledTimes(1);
    expect(auto_commit).toHaveBeenCalledWith(["notes/a.md", "notes/b.md"]);
    unmount();
  });

  it("does not commit while a save is still dirty", () => {
    const { editor_store, auto_commit, unmount } = create_harness();

    editor_store.open_note = { is_dirty: true, meta: { path: "notes/a.md" } };
    flushSync();
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS * 2);

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });

  it("commits the new path when a rename lands inside the debounce window", () => {
    const { auto_commit, save, rename, unmount } = create_harness();

    save("notes/a.md");
    rename("notes/a.md", "notes/b.md");
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);

    // W-A: the old path would have been staged as a deletion, and the new path
    // was never queued at all — leaving it untracked for "Discard All" to delete.
    expect(auto_commit).toHaveBeenCalledWith(["notes/b.md"]);
    unmount();
  });

  it("drops a queued path the vault no longer knows about", () => {
    const { notes_store, auto_commit, save, unmount } = create_harness();

    save("notes/a.md");
    notes_store.notes = [];
    flushSync();
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });

  it("commits only the surviving paths when one goes stale", () => {
    const { notes_store, auto_commit, save, unmount } = create_harness({
      vault_paths: ["notes/a.md", "notes/b.md"],
    });

    save("notes/a.md");
    save("notes/b.md");
    notes_store.notes = [{ path: "notes/b.md" }];
    flushSync();
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);

    expect(auto_commit).toHaveBeenCalledWith(["notes/b.md"]);
    unmount();
  });

  it("skips draft note paths", () => {
    const { auto_commit, save, unmount } = create_harness();

    save("draft:Untitled");
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });

  it("retries instead of committing while a commit is in flight", () => {
    const { git_store, auto_commit, save, unmount } = create_harness();

    git_store.sync_status = "committing";
    save("notes/a.md");
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS);
    expect(auto_commit).not.toHaveBeenCalled();

    git_store.sync_status = "idle";
    vi.advanceTimersByTime(1_000);

    expect(auto_commit).toHaveBeenCalledWith(["notes/a.md"]);
    unmount();
  });

  it("fires an interval commit even while saves keep arriving", () => {
    const { auto_commit, save, unmount } = create_harness({
      mode: "interval",
      interval_minutes: 5,
    });
    const interval_ms = 5 * 60_000;

    save("notes/a.md");
    // W-B: every one of these used to reset the timer, so the interval never
    // elapsed while the user kept working.
    for (let elapsed = 0; elapsed < interval_ms; elapsed += 30_000) {
      vi.advanceTimersByTime(30_000);
      save("notes/a.md");
    }

    expect(auto_commit).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("clears queued paths when git is disabled mid-window", () => {
    const { git_store, auto_commit, save, unmount } = create_harness();

    save("notes/a.md");
    git_store.enabled = false;
    flushSync();
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS * 2);

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });

  it("does not commit when the mode is off", () => {
    const { auto_commit, save, unmount } = create_harness({ mode: "off" });

    save("notes/a.md");
    vi.advanceTimersByTime(ON_SAVE_DELAY_MS * 2);

    expect(auto_commit).not.toHaveBeenCalled();
    unmount();
  });
});
