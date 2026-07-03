import { describe, it, expect } from "vitest";
import { BaseCountsStore } from "$lib/features/bases/state/base_counts_store.svelte";

describe("BaseCountsStore", () => {
  it("returns undefined for unknown view paths", () => {
    const store = new BaseCountsStore();
    expect(store.get("views/missing.json")).toBeUndefined();
  });

  it("set_many populates counts keyed by view path", () => {
    const store = new BaseCountsStore();
    store.set_many([
      ["views/a.json", 3],
      ["views/b.json", 0],
    ]);
    expect(store.get("views/a.json")).toBe(3);
    expect(store.get("views/b.json")).toBe(0);
  });

  it("set_many replaces the full set and drops stale entries", () => {
    const store = new BaseCountsStore();
    store.set_many([
      ["views/a.json", 1],
      ["views/b.json", 2],
    ]);
    store.set_many([["views/a.json", 9]]);
    expect(store.get("views/a.json")).toBe(9);
    expect(store.get("views/b.json")).toBeUndefined();
  });

  it("clear removes all counts", () => {
    const store = new BaseCountsStore();
    store.set_many([["views/a.json", 5]]);
    store.clear();
    expect(store.get("views/a.json")).toBeUndefined();
  });
});
