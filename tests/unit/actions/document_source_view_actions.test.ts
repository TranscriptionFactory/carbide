import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import { register_document_actions } from "$lib/features/document/application/document_actions";
import { DocumentService, DocumentStore } from "$lib/features/document";
import { CanvasStore } from "$lib/features/canvas";
import { VaultStore } from "$lib/features/vault";
import { TabStore } from "$lib/features/tab";
import { create_test_vault } from "../helpers/test_fixtures";

vi.mock("svelte-sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const DRAWING_PATH = "drawings/sketch.excalidraw";
const DRAWING_JSON = '{"type":"excalidraw","elements":[]}';

function create_harness(file_path: string, file_type: string) {
  const registry = new ActionRegistry();
  const vault = new VaultStore();
  vault.set_vault(create_test_vault());
  const tab = new TabStore();
  const document_store = new DocumentStore();
  const canvas_store = new CanvasStore();
  const port = {
    open_buffer: vi.fn(),
    read_buffer_window: vi.fn(),
    close_buffer: vi.fn().mockResolvedValue(undefined),
    resolve_asset_url: vi.fn((_: string, path: string) => `asset://${path}`),
    read_file: vi.fn().mockResolvedValue(DRAWING_JSON),
    write_file: vi.fn().mockResolvedValue(undefined),
    delete_file: vi.fn(),
  };
  const document_service = new DocumentService(
    port as never,
    vault,
    document_store,
  );
  const calls: string[] = [];
  const canvas_save = vi.fn((tab_id: string) => {
    calls.push("canvas_save");
    canvas_store.set_dirty(tab_id, false);
  });
  const canvas_close = vi.fn((tab_id: string) => {
    calls.push("canvas_close");
    canvas_store.remove_state(tab_id);
  });
  const canvas_open = vi.fn(() => calls.push("canvas_open"));
  registry.register({
    id: ACTION_IDS.canvas_save,
    label: "",
    execute: (id) => canvas_save(id as string),
  });
  registry.register({
    id: ACTION_IDS.canvas_close,
    label: "",
    execute: (id) => canvas_close(id as string),
  });
  registry.register({
    id: ACTION_IDS.canvas_open,
    label: "",
    execute: () => canvas_open(),
  });

  register_document_actions({
    registry,
    stores: { vault, tab, document: document_store } as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
    document_service,
    document_store,
    canvas_store,
  });

  const filename = file_path.split("/").pop() ?? file_path;
  const tab_id = tab.open_document_tab(file_path, filename, file_type).id;

  return {
    registry,
    tab,
    tab_id,
    document_store,
    canvas_store,
    port,
    calls,
    canvas_save,
    canvas_open,
  };
}

function open_drawing(dirty: boolean) {
  const harness = create_harness(DRAWING_PATH, "excalidraw");
  harness.canvas_store.init_state(harness.tab_id, DRAWING_PATH, "excalidraw");
  harness.canvas_store.set_dirty(harness.tab_id, dirty);
  return harness;
}

describe("document source view: csv", () => {
  it("flips between table and source without touching disk", async () => {
    const { registry, document_store, tab_id, port } = create_harness(
      "data/table.csv",
      "csv",
    );
    document_store.set_viewer_state(tab_id, {
      tab_id,
      file_path: "data/table.csv",
      file_type: "csv",
      zoom: 1,
      scroll_top: 0,
      pdf_page: 1,
      cfi: null,
      html_view_mode: "safe",
      source_view: false,
      load_status: "ready",
      error_message: null,
    });

    await registry.execute(ACTION_IDS.document_set_source_view, true);
    expect(document_store.get_viewer_state(tab_id)?.source_view).toBe(true);

    await registry.execute(ACTION_IDS.document_toggle_source);
    expect(document_store.get_viewer_state(tab_id)?.source_view).toBe(false);
    expect(port.write_file).not.toHaveBeenCalled();
  });
});

describe("document source view: excalidraw", () => {
  it("loads the file as text and hands the tab over from the canvas store", async () => {
    const { registry, document_store, canvas_store, tab_id, calls } =
      open_drawing(false);

    await registry.execute(ACTION_IDS.document_set_source_view, true);

    expect(document_store.get_viewer_state(tab_id)?.source_view).toBe(true);
    expect(document_store.get_current_content(tab_id)).toBe(DRAWING_JSON);
    expect(canvas_store.get_state(tab_id)).toBeUndefined();
    expect(calls).toEqual(["canvas_close"]);
  });

  it("saves unsaved drawing edits before reading the source", async () => {
    const { registry, port, calls } = open_drawing(true);
    port.read_file.mockImplementation(() => {
      calls.push("read_file");
      return Promise.resolve(DRAWING_JSON);
    });

    await registry.execute(ACTION_IDS.document_set_source_view, true);

    expect(calls).toEqual(["canvas_save", "read_file", "canvas_close"]);
  });

  it("stays on the drawing when saving its edits fails", async () => {
    const { registry, document_store, canvas_store, tab_id, canvas_save } =
      open_drawing(true);
    canvas_save.mockImplementation(() => {});

    await registry.execute(ACTION_IDS.document_set_source_view, true);

    expect(document_store.get_viewer_state(tab_id)).toBeUndefined();
    expect(canvas_store.get_state(tab_id)?.is_dirty).toBe(true);
  });

  it("toggles into source view from the drawing", async () => {
    const { registry, document_store, tab_id } = open_drawing(false);

    await registry.execute(ACTION_IDS.document_toggle_source);

    expect(document_store.get_viewer_state(tab_id)?.source_view).toBe(true);
  });

  it("writes edited source to disk before reopening the drawing", async () => {
    const { registry, document_store, tab, tab_id, port, calls } =
      open_drawing(false);
    await registry.execute(ACTION_IDS.document_set_source_view, true);
    document_store.set_edited_content(tab_id, '{"edited":true}');
    tab.set_dirty(tab_id, true);
    port.write_file.mockImplementation(() => {
      calls.push("write_file");
      return Promise.resolve();
    });

    await registry.execute(ACTION_IDS.document_set_source_view, false);

    expect(port.write_file).toHaveBeenCalledWith(
      expect.any(String),
      DRAWING_PATH,
      '{"edited":true}',
    );
    expect(calls).toEqual(["canvas_close", "write_file", "canvas_open"]);
    expect(document_store.get_viewer_state(tab_id)).toBeUndefined();
    expect(document_store.get_content_state(tab_id)).toBeUndefined();
    expect(tab.active_tab?.is_dirty).toBe(false);
  });

  it("reopens the drawing without writing when the source is unchanged", async () => {
    const { registry, port, canvas_open } = open_drawing(false);
    await registry.execute(ACTION_IDS.document_set_source_view, true);

    await registry.execute(ACTION_IDS.document_set_source_view, false);

    expect(port.write_file).not.toHaveBeenCalled();
    expect(canvas_open).toHaveBeenCalledTimes(1);
  });

  it("keeps the source view open when writing the source fails", async () => {
    const { registry, document_store, tab_id, port, canvas_open } =
      open_drawing(false);
    await registry.execute(ACTION_IDS.document_set_source_view, true);
    document_store.set_edited_content(tab_id, "{broken");
    port.write_file.mockRejectedValue(new Error("disk full"));

    await expect(
      registry.execute(ACTION_IDS.document_set_source_view, false),
    ).rejects.toThrow("disk full");

    expect(document_store.get_viewer_state(tab_id)?.source_view).toBe(true);
    expect(document_store.get_current_content(tab_id)).toBe("{broken");
    expect(canvas_open).not.toHaveBeenCalled();
  });
});

describe("document source view: unsupported types", () => {
  it("ignores pdf tabs", async () => {
    const { registry, document_store, tab_id } = create_harness(
      "docs/paper.pdf",
      "pdf",
    );

    await registry.execute(ACTION_IDS.document_set_source_view, true);

    expect(document_store.get_viewer_state(tab_id)).toBeUndefined();
  });
});
