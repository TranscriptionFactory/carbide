import { describe, it, expect, vi } from "vitest";
import { CanvasService } from "$lib/features/canvas/application/canvas_service";
import { CanvasStore } from "$lib/features/canvas/state/canvas_store.svelte";
import { VaultStore } from "$lib/features/vault";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { CanvasPort } from "$lib/features/canvas/ports";
import { serialize_canvas, EMPTY_CANVAS } from "$lib/features/canvas";
import { create_test_vault } from "../helpers/test_fixtures";

function make_port(overrides: Partial<CanvasPort> = {}): CanvasPort {
  return {
    read_file: vi.fn().mockResolvedValue('{"nodes":[],"edges":[]}'),
    write_file: vi.fn().mockResolvedValue(undefined),
    read_camera: vi.fn().mockResolvedValue(null),
    write_camera: vi.fn().mockResolvedValue(undefined),
    rewrite_refs_for_rename: vi.fn().mockResolvedValue(0),
    read_svg_preview: vi.fn().mockResolvedValue(null),
    write_svg_preview: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function make_service(port_overrides: Partial<CanvasPort> = {}) {
  const canvas_store = new CanvasStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  const port = make_port(port_overrides);

  vault_store.vault = create_test_vault();

  const service = new CanvasService(port, vault_store, canvas_store, op_store);

  return { service, canvas_store, vault_store, op_store, port };
}

describe("CanvasService", () => {
  it("opens a canvas file and loads data into the store", async () => {
    const canvas_content = JSON.stringify({
      nodes: [
        {
          id: "n1",
          type: "text",
          text: "Hello",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
      ],
      edges: [],
    });

    const { service, canvas_store, port } = make_service({
      read_file: vi.fn().mockResolvedValue(canvas_content),
    });

    await service.open_canvas("tab1", "board.canvas");

    const state = canvas_store.get_state("tab1")!;
    expect(state.status).toBe("ready");
    expect(state.canvas_data!.nodes).toHaveLength(1);
    expect(port.read_file).toHaveBeenCalled();
    expect(port.read_camera).toHaveBeenCalled();
  });

  it("handles parse errors gracefully", async () => {
    const { service, canvas_store } = make_service({
      read_file: vi.fn().mockResolvedValue("not valid json{"),
    });

    await service.open_canvas("tab1", "bad.canvas");

    const state = canvas_store.get_state("tab1")!;
    expect(state.status).toBe("error");
    expect(state.error_message).toBe("Invalid JSON");
  });

  it("handles file read errors gracefully", async () => {
    const { service, canvas_store } = make_service({
      read_file: vi.fn().mockRejectedValue(new Error("File not found")),
    });

    await service.open_canvas("tab1", "missing.canvas");

    const state = canvas_store.get_state("tab1")!;
    expect(state.status).toBe("error");
    expect(state.error_message).toBe("File not found");
  });

  it("restores camera from sidecar on open", async () => {
    const camera = { x: 100, y: -50, zoom: 2 };
    const { service, canvas_store } = make_service({
      read_camera: vi.fn().mockResolvedValue(camera),
    });

    await service.open_canvas("tab1", "board.canvas");

    expect(canvas_store.get_state("tab1")!.camera).toEqual(camera);
  });

  it("saves canvas data and clears dirty flag", async () => {
    const canvas_content = JSON.stringify({
      nodes: [
        {
          id: "n1",
          type: "text",
          text: "Hello",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
      ],
      edges: [],
    });

    const { service, canvas_store, port } = make_service({
      read_file: vi.fn().mockResolvedValue(canvas_content),
    });

    await service.open_canvas("tab1", "board.canvas");
    canvas_store.set_dirty("tab1", true);

    await service.save_canvas("tab1");

    expect(port.write_file).toHaveBeenCalled();
    expect(canvas_store.get_state("tab1")!.is_dirty).toBe(false);
  });

  it("closes a canvas and removes state", async () => {
    const { service, canvas_store } = make_service();

    await service.open_canvas("tab1", "board.canvas");
    expect(canvas_store.get_state("tab1")).toBeDefined();

    service.close_canvas("tab1");
    expect(canvas_store.get_state("tab1")).toBeUndefined();
  });

  it("creates a new canvas file with empty content", async () => {
    const { service, port } = make_service();
    const vault_id = "test-vault-id";

    await service.create_canvas(vault_id, "new.canvas");

    expect(port.write_file).toHaveBeenCalledWith(
      vault_id,
      "new.canvas",
      serialize_canvas(EMPTY_CANVAS),
    );
  });

  it("creates a new excalidraw drawing", async () => {
    const { service, port } = make_service();
    const vault_id = "test-vault-id";

    await service.create_drawing(vault_id, "sketch.excalidraw");

    expect(port.write_file).toHaveBeenCalledWith(
      vault_id,
      "sketch.excalidraw",
      expect.stringContaining('"type": "excalidraw"'),
    );
  });

  it("exports SVG preview after saving an excalidraw file", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "badgerly",
      elements: [],
      appState: {},
    };
    const { service, canvas_store, port } = make_service({
      read_file: vi.fn().mockResolvedValue(JSON.stringify(scene)),
    });

    await service.open_canvas("tab1", "sketch.excalidraw", "excalidraw");

    const svg_provider = vi.fn().mockResolvedValue("<svg>mock</svg>");
    canvas_store.register_svg_export_provider("tab1", svg_provider);
    canvas_store.set_dirty("tab1", true);

    await service.save_canvas("tab1");

    expect(svg_provider).toHaveBeenCalled();
    expect(port.write_svg_preview).toHaveBeenCalledWith(
      expect.any(String),
      "sketch.excalidraw",
      "<svg>mock</svg>",
    );
  });

  it("does not fail save when SVG export fails", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "badgerly",
      elements: [],
      appState: {},
    };
    const { service, canvas_store, port } = make_service({
      read_file: vi.fn().mockResolvedValue(JSON.stringify(scene)),
    });

    await service.open_canvas("tab1", "sketch.excalidraw", "excalidraw");

    const svg_provider = vi.fn().mockRejectedValue(new Error("export failed"));
    canvas_store.register_svg_export_provider("tab1", svg_provider);
    canvas_store.set_dirty("tab1", true);

    await service.save_canvas("tab1");

    expect(canvas_store.get_state("tab1")!.is_dirty).toBe(false);
    expect(port.write_svg_preview).not.toHaveBeenCalled();
  });

  it("reads cached SVG preview", async () => {
    const { service, port } = make_service({
      read_svg_preview: vi.fn().mockResolvedValue("<svg>cached</svg>"),
    });

    const result = await service.read_svg_preview("sketch.excalidraw");
    expect(result).toBe("<svg>cached</svg>");
    expect(port.read_svg_preview).toHaveBeenCalled();
  });

  it("does nothing when no vault is active", async () => {
    const { service, vault_store, port } = make_service();
    vault_store.vault = null as any;

    await service.open_canvas("tab1", "board.canvas");
    expect(port.read_file).not.toHaveBeenCalled();
  });
});
