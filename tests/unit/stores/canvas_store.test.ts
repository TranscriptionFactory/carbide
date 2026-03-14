import { describe, it, expect } from "vitest";
import { CanvasStore } from "$lib/features/canvas/state/canvas_store.svelte";

const SAMPLE_DATA = {
  nodes: [
    {
      id: "n1",
      type: "text" as const,
      text: "Hello",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    },
    {
      id: "n2",
      type: "file" as const,
      file: "note.md",
      x: 300,
      y: 0,
      width: 200,
      height: 100,
    },
  ],
  edges: [{ id: "e1", fromNode: "n1", toNode: "n2" }],
};

describe("CanvasStore", () => {
  it("initializes state for a tab", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");

    const state = store.get_state("tab1");
    expect(state).toBeDefined();
    expect(state!.file_path).toBe("board.canvas");
    expect(state!.status).toBe("idle");
    expect(state!.canvas_data).toBeNull();
    expect(state!.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(state!.is_dirty).toBe(false);
  });

  it("does not overwrite existing state on re-init", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", SAMPLE_DATA);
    store.init_state("tab1", "other.canvas");

    expect(store.get_state("tab1")!.canvas_data).not.toBeNull();
    expect(store.get_state("tab1")!.file_path).toBe("board.canvas");
  });

  it("sets canvas data and marks ready", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", SAMPLE_DATA);

    const state = store.get_state("tab1")!;
    expect(state.status).toBe("ready");
    expect(state.canvas_data!.nodes).toHaveLength(2);
    expect(state.canvas_data!.edges).toHaveLength(1);
  });

  it("tracks dirty state", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");

    expect(store.get_state("tab1")!.is_dirty).toBe(false);
    store.set_dirty("tab1", true);
    expect(store.get_state("tab1")!.is_dirty).toBe(true);
    store.set_dirty("tab1", false);
    expect(store.get_state("tab1")!.is_dirty).toBe(false);
  });

  it("updates camera", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_camera("tab1", { x: 100, y: -50, zoom: 1.5 });

    expect(store.get_state("tab1")!.camera).toEqual({
      x: 100,
      y: -50,
      zoom: 1.5,
    });
  });

  it("updates a node by id and marks dirty", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", SAMPLE_DATA);
    store.set_dirty("tab1", false);

    store.update_node("tab1", "n1", { x: 50, y: 75 });

    const state = store.get_state("tab1")!;
    expect(state.is_dirty).toBe(true);
    const node = state.canvas_data!.nodes.find((n) => n.id === "n1")!;
    expect(node.x).toBe(50);
    expect(node.y).toBe(75);
  });

  it("adds and removes nodes", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", SAMPLE_DATA);

    store.add_node("tab1", {
      id: "n3",
      type: "link",
      url: "https://example.com",
      x: 0,
      y: 300,
      width: 200,
      height: 100,
    });
    expect(store.get_state("tab1")!.canvas_data!.nodes).toHaveLength(3);

    store.remove_node("tab1", "n1");
    const state = store.get_state("tab1")!;
    expect(state.canvas_data!.nodes).toHaveLength(2);
    expect(state.canvas_data!.edges).toHaveLength(0);
  });

  it("adds and removes edges", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", { nodes: [], edges: [] });

    store.add_edge("tab1", { id: "e1", fromNode: "n1", toNode: "n2" });
    expect(store.get_state("tab1")!.canvas_data!.edges).toHaveLength(1);

    store.remove_edge("tab1", "e1");
    expect(store.get_state("tab1")!.canvas_data!.edges).toHaveLength(0);
  });

  it("removes state for a tab", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    expect(store.get_state("tab1")).toBeDefined();

    store.remove_state("tab1");
    expect(store.get_state("tab1")).toBeUndefined();
  });

  it("sets error status", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_status("tab1", "error", "Parse failed");

    const state = store.get_state("tab1")!;
    expect(state.status).toBe("error");
    expect(state.error_message).toBe("Parse failed");
  });
});
