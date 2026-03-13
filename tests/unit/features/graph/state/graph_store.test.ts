import { describe, it, expect } from "vitest";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import type { GraphNeighborhoodSnapshot } from "$lib/features/graph/ports";
import type { NoteId, NotePath } from "$lib/shared/types/ids";

describe("GraphStore", () => {
  it("initializes with default values", () => {
    const store = new GraphStore();
    expect(store.panel_open).toBe(false);
    expect(store.status).toBe("idle");
    expect(store.snapshot).toBeNull();
    expect(store.center_note_path).toBeNull();
    expect(store.selected_node_ids).toEqual([]);
    expect(store.hovered_node_id).toBeNull();
    expect(store.filter_query).toBe("");
  });

  it("updates panel_open status", () => {
    const store = new GraphStore();
    store.set_panel_open(true);
    expect(store.panel_open).toBe(true);
    store.set_panel_open(false);
    expect(store.panel_open).toBe(false);
  });

  it("handles loading lifecycle", () => {
    const store = new GraphStore();
    const note_path = "test.md";

    store.start_loading(note_path);
    expect(store.status).toBe("loading");
    expect(store.center_note_path).toBe(note_path);
    expect(store.error).toBeNull();

    const snapshot: GraphNeighborhoodSnapshot = {
      center: {
        id: "id-1" as NoteId,
        path: note_path as NotePath,
        title: "Test",
        name: "test",
        mtime_ms: 0,
        size_bytes: 0,
      },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {
        node_count: 1,
        edge_count: 0,
        backlink_count: 0,
        outlink_count: 0,
        orphan_count: 0,
        bidirectional_count: 0,
      },
    };

    store.set_snapshot(snapshot);
    expect(store.status).toBe("ready");
    expect(store.snapshot).toBe(snapshot);
    expect(store.center_note_path).toBe(note_path);
    expect(store.selected_node_ids).toEqual([note_path]);
  });

  it("handles error state", () => {
    const store = new GraphStore();
    const note_path = "test.md";
    const error_message = "Failed to load";

    store.set_error(note_path, error_message);
    expect(store.status).toBe("error");
    expect(store.error).toBe(error_message);
    expect(store.center_note_path).toBe(note_path);
    expect(store.snapshot).toBeNull();
    expect(store.selected_node_ids).toEqual([]);
  });

  it("clears snapshot state", () => {
    const store = new GraphStore();
    store.set_panel_open(true);
    store.start_loading("test.md");

    store.clear_snapshot();
    expect(store.snapshot).toBeNull();
    expect(store.center_note_path).toBeNull();
    expect(store.status).toBe("idle");
    expect(store.selected_node_ids).toEqual([]);
    expect(store.filter_query).toBe("");
  });

  it("clears interaction state independently", () => {
    const store = new GraphStore();
    store.select_node("node-1");
    store.set_hovered_node("node-1");
    store.set_filter_query("search");

    store.clear_interaction_state();
    expect(store.selected_node_ids).toEqual([]);
    expect(store.hovered_node_id).toBeNull();
    expect(store.filter_query).toBe("");
  });

  it("updates selection and hover", () => {
    const store = new GraphStore();

    store.select_node("node-1");
    expect(store.selected_node_ids).toEqual(["node-1"]);

    store.select_node(null);
    expect(store.selected_node_ids).toEqual([]);

    store.set_hovered_node("node-1");
    expect(store.hovered_node_id).toBe("node-1");

    store.set_hovered_node(null);
    expect(store.hovered_node_id).toBeNull();
  });
});
