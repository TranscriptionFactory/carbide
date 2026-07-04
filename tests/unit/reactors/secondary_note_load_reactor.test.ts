/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_secondary_note_load_reactor } from "$lib/reactors/secondary_note_load.reactor.svelte";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { OpenNoteState } from "$lib/shared/types/editor";

function mock_open_note(path: string): OpenNoteState {
  return {
    meta: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path,
      title: path.replace(".md", ""),
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text(""),
    buffer_id: path,
    is_dirty: false,
  };
}

function create_reactor_harness() {
  const tab_store = new TabStore();
  const load_secondary_note = vi.fn().mockResolvedValue(undefined);
  const unmount = create_secondary_note_load_reactor(tab_store, {
    load_secondary_note,
  } as never);
  flushSync();
  return { tab_store, load_secondary_note, unmount };
}

describe("secondary_note_load.reactor", () => {
  it("loads when a secondary note tab lacks a cache entry", () => {
    const { tab_store, load_secondary_note, unmount } =
      create_reactor_harness();
    expect(load_secondary_note).not.toHaveBeenCalled();

    tab_store.open_tab(as_note_path("a.md"), "a");
    tab_store.open_tab(as_note_path("b.md"), "b");
    tab_store.open_to_side(as_note_path("b.md"));
    flushSync();

    expect(load_secondary_note).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("stays idle when the secondary note is already cached", () => {
    const { tab_store, load_secondary_note, unmount } =
      create_reactor_harness();

    tab_store.open_tab(as_note_path("b.md"), "b");
    tab_store.set_cached_note(as_note_path("b.md"), mock_open_note("b.md"));
    tab_store.open_to_side(as_note_path("b.md"));
    flushSync();

    expect(load_secondary_note).not.toHaveBeenCalled();
    unmount();
  });

  it("stays idle without a split", () => {
    const { tab_store, load_secondary_note, unmount } =
      create_reactor_harness();

    tab_store.open_tab(as_note_path("a.md"), "a");
    flushSync();

    expect(load_secondary_note).not.toHaveBeenCalled();
    unmount();
  });

  it("re-fires when the cache entry is invalidated", () => {
    const { tab_store, load_secondary_note, unmount } =
      create_reactor_harness();

    tab_store.open_tab(as_note_path("b.md"), "b");
    tab_store.set_cached_note(as_note_path("b.md"), mock_open_note("b.md"));
    tab_store.open_to_side(as_note_path("b.md"));
    flushSync();
    expect(load_secondary_note).not.toHaveBeenCalled();

    tab_store.invalidate_cache_by_path(as_note_path("b.md"));
    flushSync();

    expect(load_secondary_note).toHaveBeenCalledTimes(1);
    unmount();
  });
});
