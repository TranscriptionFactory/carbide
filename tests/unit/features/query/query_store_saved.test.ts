import { describe, expect, it, beforeEach } from "vitest";
import { QueryStore } from "$lib/features/query/state/query_store.svelte";
import type { SavedQueryMeta } from "$lib/features/query/types";

function make_saved(overrides: Partial<SavedQueryMeta> = {}): SavedQueryMeta {
  return {
    path: "test.query",
    name: "test",
    mtime_ms: 1000,
    size_bytes: 50,
    ...overrides,
  };
}

describe("QueryStore saved queries", () => {
  let store: QueryStore;

  beforeEach(() => {
    store = new QueryStore();
  });

  it("starts with empty saved queries", () => {
    expect(store.saved_queries).toEqual([]);
    expect(store.active_saved_path).toBeNull();
  });

  it("sets saved queries", () => {
    const queries = [
      make_saved({ path: "a.query" }),
      make_saved({ path: "b.query" }),
    ];
    store.set_saved_queries(queries);
    expect(store.saved_queries).toHaveLength(2);
  });

  it("adds a saved query and deduplicates by path", () => {
    store.set_saved_queries([make_saved({ path: "a.query", name: "a" })]);
    store.add_saved_query(make_saved({ path: "a.query", name: "a-updated" }));
    expect(store.saved_queries).toHaveLength(1);
    expect(store.saved_queries[0]!.name).toBe("a-updated");
  });

  it("prepends new saved query", () => {
    store.set_saved_queries([make_saved({ path: "old.query", name: "old" })]);
    store.add_saved_query(make_saved({ path: "new.query", name: "new" }));
    expect(store.saved_queries[0]!.path).toBe("new.query");
  });

  it("removes saved query by path", () => {
    store.set_saved_queries([
      make_saved({ path: "a.query" }),
      make_saved({ path: "b.query" }),
    ]);
    store.remove_saved_query("a.query");
    expect(store.saved_queries).toHaveLength(1);
    expect(store.saved_queries[0]!.path).toBe("b.query");
  });

  it("clears active_saved_path when active query is removed", () => {
    store.active_saved_path = "a.query";
    store.set_saved_queries([make_saved({ path: "a.query" })]);
    store.remove_saved_query("a.query");
    expect(store.active_saved_path).toBeNull();
  });

  it("preserves active_saved_path when a different query is removed", () => {
    store.active_saved_path = "b.query";
    store.set_saved_queries([
      make_saved({ path: "a.query" }),
      make_saved({ path: "b.query" }),
    ]);
    store.remove_saved_query("a.query");
    expect(store.active_saved_path).toBe("b.query");
  });

  it("clears active_saved_path on clear()", () => {
    store.active_saved_path = "test.query";
    store.clear();
    expect(store.active_saved_path).toBeNull();
  });
});
