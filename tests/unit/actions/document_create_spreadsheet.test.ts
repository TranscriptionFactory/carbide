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

function create_harness(existing: string[], selected_folder_path = "") {
  const registry = new ActionRegistry();
  const vault = new VaultStore();
  vault.set_vault(create_test_vault());
  const tab = new TabStore();
  const document_store = new DocumentStore();
  const files = new Set(existing);
  const port = {
    open_buffer: vi.fn(),
    read_buffer_window: vi.fn(),
    close_buffer: vi.fn().mockResolvedValue(undefined),
    resolve_asset_url: vi.fn(),
    read_file: vi.fn(async (_: string, path: string) => {
      if (!files.has(path)) throw new Error("not found");
      return "";
    }),
    write_file: vi.fn(async (_: string, path: string) => {
      files.add(path);
    }),
    delete_file: vi.fn(),
  };
  const document_service = new DocumentService(
    port as never,
    vault,
    document_store,
  );
  register_document_actions({
    registry,
    stores: {
      vault,
      tab,
      document: document_store,
      ui: { selected_folder_path },
    } as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: false,
      bootstrap_default_vault_path: null,
    },
    document_service,
    document_store,
    canvas_store: new CanvasStore(),
  });
  return { registry, tab, port };
}

describe("document.create_spreadsheet", () => {
  it("creates an empty Untitled.csv in the given folder and opens it", async () => {
    const { registry, tab, port } = create_harness([]);
    await registry.execute(ACTION_IDS.document_create_spreadsheet, "data");
    expect(port.write_file).toHaveBeenCalledWith(
      expect.anything(),
      "data/Untitled.csv",
      "",
    );
    expect(tab.active_tab).toMatchObject({
      kind: "document",
      title: "Untitled.csv",
    });
  });

  it("picks the next free name when Untitled.csv exists", async () => {
    const { registry, port } = create_harness([
      "data/Untitled.csv",
      "data/Untitled 2.csv",
    ]);
    await registry.execute(ACTION_IDS.document_create_spreadsheet, "data");
    expect(port.write_file).toHaveBeenCalledWith(
      expect.anything(),
      "data/Untitled 3.csv",
      "",
    );
  });

  it("falls back to the selected folder, and the vault root when empty", async () => {
    const selected = create_harness([], "notes");
    await selected.registry.execute(ACTION_IDS.document_create_spreadsheet);
    expect(selected.port.write_file).toHaveBeenCalledWith(
      expect.anything(),
      "notes/Untitled.csv",
      "",
    );

    const root = create_harness([]);
    await root.registry.execute(ACTION_IDS.document_create_spreadsheet);
    expect(root.port.write_file).toHaveBeenCalledWith(
      expect.anything(),
      "Untitled.csv",
      "",
    );
  });
});
