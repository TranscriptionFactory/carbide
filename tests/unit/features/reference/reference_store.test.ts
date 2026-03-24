import { describe, it, expect } from "vitest";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import type { CslItem } from "$lib/features/reference/types";

function make_item(id: string): CslItem {
  return { id, type: "article-journal", title: `Item ${id}` };
}

describe("ReferenceStore", () => {
  it("starts with empty state", () => {
    const store = new ReferenceStore();
    expect(store.library_items).toEqual([]);
    expect(store.search_results).toEqual([]);
    expect(store.connection_status).toBe("idle");
    expect(store.selected_citekeys).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
  });

  it("sets library items", () => {
    const store = new ReferenceStore();
    const items = [make_item("a"), make_item("b")];
    store.set_library_items(items);
    expect(store.library_items).toHaveLength(2);
  });

  it("adds new item", () => {
    const store = new ReferenceStore();
    store.add_item(make_item("a"));
    expect(store.library_items).toHaveLength(1);
    expect(store.library_items[0]!.id).toBe("a");
  });

  it("updates existing item on duplicate citekey", () => {
    const store = new ReferenceStore();
    store.add_item(make_item("a"));
    store.add_item({ ...make_item("a"), title: "Updated" });
    expect(store.library_items).toHaveLength(1);
    expect(store.library_items[0]!.title).toBe("Updated");
  });

  it("removes item by citekey", () => {
    const store = new ReferenceStore();
    store.add_item(make_item("a"));
    store.add_item(make_item("b"));
    store.remove_item("a");
    expect(store.library_items).toHaveLength(1);
    expect(store.library_items[0]!.id).toBe("b");
  });

  it("removes citekey from selection when item is removed", () => {
    const store = new ReferenceStore();
    store.set_selected_citekeys(["a", "b"]);
    store.remove_item("a");
    expect(store.selected_citekeys).toEqual(["b"]);
  });

  it("toggles citekey selection", () => {
    const store = new ReferenceStore();
    store.toggle_citekey("a");
    expect(store.selected_citekeys).toEqual(["a"]);
    store.toggle_citekey("a");
    expect(store.selected_citekeys).toEqual([]);
  });

  it("resets all state", () => {
    const store = new ReferenceStore();
    store.add_item(make_item("a"));
    store.set_loading(true);
    store.set_error("oops");
    store.set_connection_status("connected");
    store.set_selected_citekeys(["a"]);
    store.reset();
    expect(store.library_items).toEqual([]);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();
    expect(store.connection_status).toBe("idle");
    expect(store.selected_citekeys).toEqual([]);
  });
});
