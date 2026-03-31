import { describe, it, expect, vi } from "vitest";
import { CanvasService } from "$lib/features/canvas/application/canvas_service";
import { CanvasStore } from "$lib/features/canvas/state/canvas_store.svelte";
import { VaultStore } from "$lib/features/vault";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { CanvasPort } from "$lib/features/canvas/ports";
import { serialize_canvas, EMPTY_CANVAS } from "$lib/features/canvas";
import { create_test_vault } from "../helpers/test_fixtures";
import type { CanvasTabState } from "$lib/features/canvas/state/canvas_store.svelte";

type CanvasPortMocks = {
  read_file: ReturnType<typeof vi.fn>;
  write_file: ReturnType<typeof vi.fn>;
  read_camera: ReturnType<typeof vi.fn>;
  write_camera: ReturnType<typeof vi.fn>;
  rewrite_refs_for_rename: ReturnType<typeof vi.fn>;
  read_svg_preview: ReturnType<typeof vi.fn>;
  write_svg_preview: ReturnType<typeof vi.fn>;
};

function make_port(overrides: Partial<CanvasPort> = {}) {
  const base_mocks: CanvasPortMocks = {
    read_file: vi.fn().mockResolvedValue('{"nodes":[],"edges":[]}'),
    write_file: vi.fn().mockResolvedValue(undefined),
    read_camera: vi.fn().mockResolvedValue(null),
    write_camera: vi.fn().mockResolvedValue(undefined),
    rewrite_refs_for_rename: vi.fn().mockResolvedValue(0),
    read_svg_preview: vi.fn().mockResolvedValue(null),
    write_svg_preview: vi.fn().mockResolvedValue(undefined),
  };
  const mocks: CanvasPortMocks = {
    read_file: (overrides.read_file ??
      base_mocks.read_file) as CanvasPortMocks["read_file"],
    write_file: (overrides.write_file ??
      base_mocks.write_file) as CanvasPortMocks["write_file"],
    read_camera: (overrides.read_camera ??
      base_mocks.read_camera) as CanvasPortMocks["read_camera"],
    write_camera: (overrides.write_camera ??
      base_mocks.write_camera) as CanvasPortMocks["write_camera"],
    rewrite_refs_for_rename: (overrides.rewrite_refs_for_rename ??
      base_mocks.rewrite_refs_for_rename) as CanvasPortMocks["rewrite_refs_for_rename"],
    read_svg_preview: (overrides.read_svg_preview ??
      base_mocks.read_svg_preview) as CanvasPortMocks["read_svg_preview"],
    write_svg_preview: (overrides.write_svg_preview ??
      base_mocks.write_svg_preview) as CanvasPortMocks["write_svg_preview"],
  };

  return {
    port: {
      ...mocks,
    } as CanvasPort,
    mocks,
  };
}

function make_service(port_overrides: Partial<CanvasPort> = {}) {
  const canvas_store = new CanvasStore();
  const vault_store = new VaultStore();
  const op_store = new OpStore();
  const { port, mocks } = make_port(port_overrides);

  vault_store.vault = create_test_vault();

  const service = new CanvasService(port, vault_store, canvas_store, op_store);

  return { service, canvas_store, vault_store, op_store, port, mocks };
}

function expect_defined<T>(value: T | undefined, label: string): T {
  expect(value, label).toBeDefined();
  return value as T;
}

function expect_not_null<T>(value: T | null, label: string): T {
  expect(value, label).not.toBeNull();
  return value as T;
}

function get_state(canvas_store: CanvasStore): CanvasTabState {
  return expect_defined(canvas_store.get_state("tab1"), "canvas state");
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

    const { service, canvas_store, mocks } = make_service({
      read_file: vi.fn().mockResolvedValue(canvas_content),
    });

    await service.open_canvas("tab1", "board.canvas");

    const state = get_state(canvas_store);
    expect(state.status).toBe("ready");
    expect(
      expect_not_null(state.canvas_data, "canvas data").nodes,
    ).toHaveLength(1);
    expect(mocks.read_file).toHaveBeenCalled();
    expect(mocks.read_camera).toHaveBeenCalled();
  });

  it("handles parse errors gracefully", async () => {
    const { service, canvas_store } = make_service({
      read_file: vi.fn().mockResolvedValue("not valid json{"),
    });

    await service.open_canvas("tab1", "bad.canvas");

    const state = get_state(canvas_store);
    expect(state.status).toBe("error");
    expect(state.error_message).toBe("Invalid JSON");
  });

  it("handles file read errors gracefully", async () => {
    const { service, canvas_store } = make_service({
      read_file: vi.fn().mockRejectedValue(new Error("File not found")),
    });

    await service.open_canvas("tab1", "missing.canvas");

    const state = get_state(canvas_store);
    expect(state.status).toBe("error");
    expect(state.error_message).toBe("File not found");
  });

  it("restores camera from sidecar on open", async () => {
    const camera = { x: 100, y: -50, zoom: 2 };
    const { service, canvas_store } = make_service({
      read_camera: vi.fn().mockResolvedValue(camera),
    });

    await service.open_canvas("tab1", "board.canvas");

    expect(get_state(canvas_store).camera).toEqual(camera);
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

    const { service, canvas_store, mocks } = make_service({
      read_file: vi.fn().mockResolvedValue(canvas_content),
    });

    await service.open_canvas("tab1", "board.canvas");
    canvas_store.set_dirty("tab1", true);

    await service.save_canvas("tab1");

    expect(mocks.write_file).toHaveBeenCalled();
    expect(get_state(canvas_store).is_dirty).toBe(false);
  });

  it("closes a canvas and removes state", async () => {
    const { service, canvas_store } = make_service();

    await service.open_canvas("tab1", "board.canvas");
    expect(canvas_store.get_state("tab1")).toBeDefined();

    service.close_canvas("tab1");
    expect(canvas_store.get_state("tab1")).toBeUndefined();
  });

  it("creates a new canvas file with empty content", async () => {
    const { service, mocks } = make_service();
    const vault_id = "test-vault-id";

    await service.create_canvas(vault_id, "new.canvas");

    expect(mocks.write_file).toHaveBeenCalledWith(
      vault_id,
      "new.canvas",
      serialize_canvas(EMPTY_CANVAS),
    );
  });

  it("creates a new excalidraw drawing", async () => {
    const { service, mocks } = make_service();
    const vault_id = "test-vault-id";

    await service.create_drawing(vault_id, "sketch.excalidraw");

    expect(mocks.write_file).toHaveBeenCalledWith(
      vault_id,
      "sketch.excalidraw",
      expect.stringContaining('"type": "excalidraw"'),
    );
  });

  it("exports SVG preview after saving an excalidraw file", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "carbide",
      elements: [],
      appState: {},
    };
    const { service, canvas_store, mocks } = make_service({
      read_file: vi.fn().mockResolvedValue(JSON.stringify(scene)),
    });

    await service.open_canvas("tab1", "sketch.excalidraw", "excalidraw");

    const svg_provider = vi.fn().mockResolvedValue("<svg>mock</svg>");
    canvas_store.register_svg_export_provider("tab1", svg_provider);
    canvas_store.set_dirty("tab1", true);

    await service.save_canvas("tab1");

    expect(svg_provider).toHaveBeenCalled();
    expect(mocks.write_svg_preview).toHaveBeenCalledWith(
      expect.any(String),
      "sketch.excalidraw",
      "<svg>mock</svg>",
    );
  });

  it("does not fail save when SVG export fails", async () => {
    const scene = {
      type: "excalidraw",
      version: 2,
      source: "carbide",
      elements: [],
      appState: {},
    };
    const { service, canvas_store, mocks } = make_service({
      read_file: vi.fn().mockResolvedValue(JSON.stringify(scene)),
    });

    await service.open_canvas("tab1", "sketch.excalidraw", "excalidraw");

    const svg_provider = vi.fn().mockRejectedValue(new Error("export failed"));
    canvas_store.register_svg_export_provider("tab1", svg_provider);
    canvas_store.set_dirty("tab1", true);

    await service.save_canvas("tab1");

    expect(get_state(canvas_store).is_dirty).toBe(false);
    expect(mocks.write_svg_preview).not.toHaveBeenCalled();
  });

  it("reads cached SVG preview", async () => {
    const { service, mocks } = make_service({
      read_svg_preview: vi.fn().mockResolvedValue("<svg>cached</svg>"),
    });

    const result = await service.read_svg_preview("sketch.excalidraw");
    expect(result).toBe("<svg>cached</svg>");
    expect(mocks.read_svg_preview).toHaveBeenCalled();
  });

  it("does nothing when no vault is active", async () => {
    const { service, vault_store, mocks } = make_service();
    vault_store.vault = null as unknown as typeof vault_store.vault;

    await service.open_canvas("tab1", "board.canvas");
    expect(mocks.read_file).not.toHaveBeenCalled();
  });

  it("discards stale open_canvas results when called rapidly", async () => {
    let resolve_first!: (value: string) => void;
    const first_promise = new Promise<string>((r) => {
      resolve_first = r;
    });
    const second_content = JSON.stringify({
      nodes: [
        {
          id: "n2",
          type: "text",
          text: "Second",
          x: 0,
          y: 0,
          width: 200,
          height: 100,
        },
      ],
      edges: [],
    });

    let call_count = 0;
    const { service, canvas_store } = make_service({
      read_file: vi.fn().mockImplementation(() => {
        call_count++;
        if (call_count === 1) return first_promise;
        return Promise.resolve(second_content);
      }),
    });

    const first_open = service.open_canvas("tab1", "first.canvas");
    await service.open_canvas("tab1", "second.canvas");

    resolve_first(
      JSON.stringify({
        nodes: [
          {
            id: "n1",
            type: "text",
            text: "First",
            x: 0,
            y: 0,
            width: 200,
            height: 100,
          },
        ],
        edges: [],
      }),
    );
    await first_open;

    const state = get_state(canvas_store);
    expect(state.status).toBe("ready");
    const node = expect_defined(
      expect_not_null(state.canvas_data, "canvas data").nodes[0],
      "first node",
    );
    expect(node.id).toBe("n2");
  });
});
