import { describe, expect, it } from "vitest";
import { VimNavStore } from "$lib/features/vim_nav";

describe("VimNavStore", () => {
  it("initializes with none context", () => {
    const store = new VimNavStore();
    expect(store.active_context).toBe("none");
    expect(store.pending_keys).toBe("");
    expect(store.cheatsheet_open).toBe(false);
  });

  it("sets context and clears pending on context change", () => {
    const store = new VimNavStore();
    store.set_pending_keys("g");
    store.set_context("file_tree");
    expect(store.active_context).toBe("file_tree");
    expect(store.pending_keys).toBe("");
  });

  it("does not clear pending when setting same context", () => {
    const store = new VimNavStore();
    store.set_context("file_tree");
    store.set_pending_keys("g");
    store.set_context("file_tree");
    expect(store.pending_keys).toBe("g");
  });

  it("toggles cheatsheet", () => {
    const store = new VimNavStore();
    store.toggle_cheatsheet();
    expect(store.cheatsheet_open).toBe(true);
    store.toggle_cheatsheet();
    expect(store.cheatsheet_open).toBe(false);
  });

  it("resets all state", () => {
    const store = new VimNavStore();
    store.set_context("outline");
    store.set_pending_keys("gg");
    store.cheatsheet_open = true;

    store.reset();
    expect(store.active_context).toBe("none");
    expect(store.pending_keys).toBe("");
    expect(store.cheatsheet_open).toBe(false);
  });
});
