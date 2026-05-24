import { describe, expect, it } from "vitest";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";

function make_store_with_instance(query = "test") {
  const store = new SearchGraphStore();
  store.create_instance("tab1", query);
  return store;
}

describe("SearchGraphStore", () => {
  describe("multi-select", () => {
    it("toggle_selected adds and removes node ids", () => {
      const store = make_store_with_instance();
      store.toggle_selected("tab1", "a.md");
      expect(store.get_instance("tab1")?.selected_node_ids.has("a.md")).toBe(
        true,
      );

      store.toggle_selected("tab1", "b.md");
      expect(store.get_instance("tab1")?.selected_node_ids.size).toBe(2);

      store.toggle_selected("tab1", "a.md");
      expect(store.get_instance("tab1")?.selected_node_ids.has("a.md")).toBe(
        false,
      );
      expect(store.get_instance("tab1")?.selected_node_ids.size).toBe(1);
    });

    it("select_range selects contiguous range from ordered paths", () => {
      const store = make_store_with_instance();
      const paths = ["a.md", "b.md", "c.md", "d.md", "e.md"];

      store.select_range("tab1", "b.md", "d.md", paths);
      const selected = store.get_instance("tab1")?.selected_node_ids;
      expect(selected?.size).toBe(3);
      expect(selected?.has("b.md")).toBe(true);
      expect(selected?.has("c.md")).toBe(true);
      expect(selected?.has("d.md")).toBe(true);
      expect(selected?.has("a.md")).toBe(false);
      expect(selected?.has("e.md")).toBe(false);
    });

    it("select_range works in reverse direction", () => {
      const store = make_store_with_instance();
      const paths = ["a.md", "b.md", "c.md"];

      store.select_range("tab1", "c.md", "a.md", paths);
      const selected = store.get_instance("tab1")?.selected_node_ids;
      expect(selected?.size).toBe(3);
    });

    it("select_range is additive to existing selection", () => {
      const store = make_store_with_instance();
      const paths = ["a.md", "b.md", "c.md", "d.md"];

      store.toggle_selected("tab1", "a.md");
      store.select_range("tab1", "c.md", "d.md", paths);

      const selected = store.get_instance("tab1")?.selected_node_ids;
      expect(selected?.size).toBe(3);
      expect(selected?.has("a.md")).toBe(true);
      expect(selected?.has("c.md")).toBe(true);
      expect(selected?.has("d.md")).toBe(true);
    });

    it("select_range ignores invalid ids", () => {
      const store = make_store_with_instance();
      store.select_range("tab1", "x.md", "y.md", ["a.md", "b.md"]);
      expect(store.get_instance("tab1")?.selected_node_ids.size).toBe(0);
    });

    it("clear_selected empties the selection", () => {
      const store = make_store_with_instance();
      store.toggle_selected("tab1", "a.md");
      store.toggle_selected("tab1", "b.md");
      store.clear_selected("tab1");
      expect(store.get_instance("tab1")?.selected_node_ids.size).toBe(0);
    });

    it("select_all_visible replaces selection with given paths", () => {
      const store = make_store_with_instance();
      store.toggle_selected("tab1", "x.md");
      store.select_all_visible("tab1", ["a.md", "b.md", "c.md"]);
      const selected = store.get_instance("tab1")?.selected_node_ids;
      expect(selected?.size).toBe(3);
      expect(selected?.has("x.md")).toBe(false);
    });
  });

  describe("filtering", () => {
    it("toggle_neighbors flips show_neighbors", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.show_neighbors).toBe(true);
      store.toggle_neighbors("tab1");
      expect(store.get_instance("tab1")?.show_neighbors).toBe(false);
      store.toggle_neighbors("tab1");
      expect(store.get_instance("tab1")?.show_neighbors).toBe(true);
    });

    it("set_min_score updates min_score", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.min_score).toBe(0);
      store.set_min_score("tab1", 0.5);
      expect(store.get_instance("tab1")?.min_score).toBe(0.5);
    });
  });

  describe("defaults", () => {
    it("new instance has empty selected_node_ids", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.selected_node_ids.size).toBe(0);
    });

    it("new instance has show_neighbors true", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.show_neighbors).toBe(true);
    });

    it("new instance has min_score 0", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.min_score).toBe(0);
    });
  });

  describe("operations on missing tab", () => {
    it("toggle_selected on missing tab is a no-op", () => {
      const store = new SearchGraphStore();
      store.toggle_selected("missing", "a.md");
      expect(store.get_instance("missing")).toBeUndefined();
    });

    it("select_range on missing tab is a no-op", () => {
      const store = new SearchGraphStore();
      store.select_range("missing", "a.md", "b.md", ["a.md", "b.md"]);
      expect(store.get_instance("missing")).toBeUndefined();
    });
  });
});
