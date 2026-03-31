import { describe, it, expect } from "vitest";
import { CanvasStore } from "$lib/features/canvas/state/canvas_store.svelte";
import type { CanvasData, CanvasNode } from "$lib/features/canvas/types/canvas";

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
} satisfies CanvasData;

function expect_defined<T>(value: T | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function expect_not_null<T>(value: T | null, label: string): T {
  expect(value, label).not.toBeNull();
  return value as T;
}

function get_state(store: CanvasStore) {
  return expect_defined(store.get_state("tab1"), "canvas state");
}

function find_node(data: CanvasData, id: string): CanvasNode {
  const node = data.nodes.find((candidate) => candidate.id === id);
  return expect_defined(node, `node ${id}`);
}

describe("CanvasStore", () => {
  it("initializes state for a tab", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");

    const state = store.get_state("tab1");
    const defined_state = expect_defined(state, "initialized canvas state");
    expect(defined_state.file_path).toBe("board.canvas");
    expect(defined_state.status).toBe("idle");
    expect(defined_state.canvas_data).toBeNull();
    expect(defined_state.camera).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(defined_state.is_dirty).toBe(false);
  });

  it("does not overwrite existing state on re-init", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", SAMPLE_DATA);
    store.init_state("tab1", "other.canvas");

    expect(get_state(store).canvas_data).not.toBeNull();
    expect(get_state(store).file_path).toBe("board.canvas");
  });

  it("sets canvas data and marks ready", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", SAMPLE_DATA);

    const state = get_state(store);
    expect(state.status).toBe("ready");
    const canvas_data = expect_not_null(state.canvas_data, "ready canvas data");
    expect(canvas_data.nodes).toHaveLength(2);
    expect(canvas_data.edges).toHaveLength(1);
  });

  it("tracks dirty state", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");

    expect(get_state(store).is_dirty).toBe(false);
    store.set_dirty("tab1", true);
    expect(get_state(store).is_dirty).toBe(true);
    store.set_dirty("tab1", false);
    expect(get_state(store).is_dirty).toBe(false);
  });

  it("updates camera", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_camera("tab1", { x: 100, y: -50, zoom: 1.5 });

    expect(get_state(store).camera).toEqual({
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

    const state = get_state(store);
    expect(state.is_dirty).toBe(true);
    const canvas_data = expect_not_null(
      state.canvas_data,
      "updated canvas data",
    );
    const node = find_node(canvas_data, "n1");
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
    expect(
      expect_not_null(get_state(store).canvas_data, "canvas data after add")
        .nodes,
    ).toHaveLength(3);

    store.remove_node("tab1", "n1");
    const state = get_state(store);
    const canvas_data = expect_not_null(
      state.canvas_data,
      "canvas data after remove",
    );
    expect(canvas_data.nodes).toHaveLength(2);
    expect(canvas_data.edges).toHaveLength(0);
  });

  it("adds and removes edges", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas");
    store.set_canvas_data("tab1", { nodes: [], edges: [] });

    store.add_edge("tab1", { id: "e1", fromNode: "n1", toNode: "n2" });
    expect(
      expect_not_null(
        get_state(store).canvas_data,
        "canvas data after edge add",
      ).edges,
    ).toHaveLength(1);

    store.remove_edge("tab1", "e1");
    expect(
      expect_not_null(
        get_state(store).canvas_data,
        "canvas data after edge remove",
      ).edges,
    ).toHaveLength(0);
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

    const state = get_state(store);
    expect(state.status).toBe("error");
    expect(state.error_message).toBe("Parse failed");
  });

  it("remove_state cleans up scene and SVG export providers", () => {
    const store = new CanvasStore();
    store.init_state("tab1", "board.canvas", "excalidraw");

    const scene_provider = () =>
      Promise.resolve({ elements: [], appState: {} });
    const svg_provider = () => Promise.resolve("<svg></svg>");
    store.register_scene_provider("tab1", scene_provider);
    store.register_svg_export_provider("tab1", svg_provider);

    expect(store.get_scene_provider("tab1")).toBeDefined();
    expect(store.get_svg_export_provider("tab1")).toBeDefined();

    store.remove_state("tab1");

    expect(store.get_scene_provider("tab1")).toBeUndefined();
    expect(store.get_svg_export_provider("tab1")).toBeUndefined();
  });
});
