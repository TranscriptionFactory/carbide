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

  describe("sorting", () => {
    it("new instance defaults to relevance descending", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.sort_mode).toBe("relevance");
      expect(store.get_instance("tab1")?.sort_ascending).toBe(false);
    });

    it("set_sort_mode persists the chosen mode", () => {
      const store = make_store_with_instance();
      store.set_sort_mode("tab1", "date_modified");
      expect(store.get_instance("tab1")?.sort_mode).toBe("date_modified");
      store.set_sort_mode("tab1", "name");
      expect(store.get_instance("tab1")?.sort_mode).toBe("name");
    });

    it("toggle_sort_order flips and round-trips sort_ascending", () => {
      const store = make_store_with_instance();
      store.toggle_sort_order("tab1");
      expect(store.get_instance("tab1")?.sort_ascending).toBe(true);
      store.toggle_sort_order("tab1");
      expect(store.get_instance("tab1")?.sort_ascending).toBe(false);
    });

    it("set_sort_mode preserves the direction", () => {
      const store = make_store_with_instance();
      store.toggle_sort_order("tab1");
      store.set_sort_mode("tab1", "name");
      expect(store.get_instance("tab1")?.sort_ascending).toBe(true);
      expect(store.get_instance("tab1")?.sort_mode).toBe("name");
    });

    it("sort setters on a missing tab are no-ops", () => {
      const store = new SearchGraphStore();
      store.set_sort_mode("missing", "name");
      store.toggle_sort_order("missing");
      expect(store.get_instance("missing")).toBeUndefined();
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

    it("new instance has graph_expanded false", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.graph_expanded).toBe(false);
    });

    it("new instance has folder_scope null", () => {
      const store = make_store_with_instance();
      expect(store.get_instance("tab1")?.folder_scope).toBeNull();
    });
  });

  describe("folder scope", () => {
    it("set_folder_scope persists and clears per tab", () => {
      const store = make_store_with_instance();
      store.create_instance("tab2", "other");

      store.set_folder_scope("tab1", "Projects");
      expect(store.get_instance("tab1")?.folder_scope).toBe("Projects");
      expect(store.get_instance("tab2")?.folder_scope).toBeNull();

      store.set_folder_scope("tab1", null);
      expect(store.get_instance("tab1")?.folder_scope).toBeNull();
    });

    it("set_folder_scope on missing tab is a no-op", () => {
      const store = new SearchGraphStore();
      store.set_folder_scope("missing", "Projects");
      expect(store.get_instance("missing")).toBeUndefined();
    });
  });

  describe("graph expansion", () => {
    it("set_graph_expanded persists and round-trips", () => {
      const store = make_store_with_instance();
      store.set_graph_expanded("tab1", true);
      expect(store.get_instance("tab1")?.graph_expanded).toBe(true);
      store.set_graph_expanded("tab1", false);
      expect(store.get_instance("tab1")?.graph_expanded).toBe(false);
    });

    it("set_graph_expanded on missing tab is a no-op", () => {
      const store = new SearchGraphStore();
      store.set_graph_expanded("missing", true);
      expect(store.get_instance("missing")).toBeUndefined();
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

  describe("search results", () => {
    const snapshot = {
      query: "q",
      nodes: [{ path: "a.md", title: "A", kind: "hit" as const }],
      edges: [],
      stats: {
        hit_count: 1,
        neighbor_count: 0,
        wiki_edge_count: 0,
        semantic_edge_count: 0,
        smart_link_edge_count: 0,
      },
    };

    function interact(store: SearchGraphStore) {
      store.select_node("tab1", "a.md");
      store.toggle_selected("tab1", "a.md");
      store.set_hovered_node("tab1", "a.md");
      store.toggle_user_expanded("tab1", "a.md");
    }

    it("set_search_result resets interaction state from the previous query", () => {
      const store = make_store_with_instance();
      interact(store);

      store.set_search_result("tab1", snapshot, new Set(["n.md"]), null);

      const inst = store.get_instance("tab1");
      expect(inst?.snapshot).toBe(snapshot);
      expect(inst?.status).toBe("ready");
      expect(inst?.auto_expanded_ids).toEqual(new Set(["n.md"]));
      expect(inst?.selected_node_id).toBeNull();
      expect(inst?.selected_node_ids.size).toBe(0);
      expect(inst?.hovered_node_id).toBeNull();
      expect(inst?.user_expanded_ids.size).toBe(0);
      expect(inst?.scroll_to_path).toBeNull();
    });

    it("set_snapshot keeps interaction state for refinements of the same result", () => {
      const store = make_store_with_instance();
      interact(store);

      store.set_snapshot("tab1", snapshot, new Set(), null);

      const inst = store.get_instance("tab1");
      expect(inst?.selected_node_id).toBe("a.md");
      expect(inst?.selected_node_ids.has("a.md")).toBe(true);
      expect(inst?.hovered_node_id).toBe("a.md");
      expect(inst?.user_expanded_ids.has("a.md")).toBe(true);
      expect(inst?.scroll_to_path).toBe("a.md");
    });
  });
});
