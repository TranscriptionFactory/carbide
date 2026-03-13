import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "$lib/features/document";
import { DocumentStore } from "$lib/features/document";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";

describe("DocumentService", () => {
  function create_document_port() {
    return {
      open_buffer: vi.fn().mockResolvedValue(123),
      read_buffer_window: vi.fn().mockResolvedValue(""),
      close_buffer: vi.fn().mockResolvedValue(undefined),
      resolve_asset_url: vi.fn((_: string, relative_path: string) => {
        return `asset://${relative_path}`;
      }),
      read_file: vi.fn().mockResolvedValue(""),
    };
  }

  it("opens a managed buffer for text documents", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
      () => 10,
      1,
    );

    await service.open_document("tab-1", "docs/demo.txt", "text");

    expect(document_port.open_buffer).toHaveBeenCalledWith(
      "buf_tab-1",
      vault_store.vault?.id,
      "docs/demo.txt",
    );
    expect(document_store.get_viewer_state("tab-1")?.load_status).toBe("ready");
    expect(document_store.get_content_state("tab-1")?.buffer_id).toBe(
      "buf_tab-1",
    );
    expect(document_store.get_content_state("tab-1")?.line_count).toBe(123);
  });

  it("evicts inactive cached payloads while keeping metadata", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    let now = 0;
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
      () => ++now,
      0,
    );

    await service.open_document("tab-1", "docs/one.txt", "text");
    await service.open_document("tab-2", "docs/two.txt", "text");

    service.sync_open_tabs("tab-2", ["tab-1", "tab-2"]);

    expect(document_store.get_content_state("tab-1")).toBeUndefined();
    expect(document_store.get_viewer_state("tab-1")?.file_path).toBe(
      "docs/one.txt",
    );
    expect(document_store.get_content_state("tab-2")?.buffer_id).toBe(
      "buf_tab-2",
    );
    expect(document_port.close_buffer).toHaveBeenCalledWith("buf_tab-1");
  });

  it("reuses cached ready buffers without reopening", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/demo.txt", "text");
    await service.ensure_content("tab-1");

    expect(document_port.open_buffer).toHaveBeenCalledTimes(1);
  });

  it("closes the managed buffer when the document is closed", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/demo.txt", "text");
    service.close_document("tab-1");

    expect(document_port.close_buffer).toHaveBeenCalledWith("buf_tab-1");
    expect(document_store.get_content_state("tab-1")).toBeUndefined();
    expect(document_store.get_viewer_state("tab-1")).toBeUndefined();
  });

  it("stores the initial pdf page when opening a pdf document", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/demo.pdf", "pdf", 7);

    expect(document_store.get_viewer_state("tab-1")?.pdf_page).toBe(7);
  });

  it("ignores invalid initial pdf pages", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/demo.pdf", "pdf", 0);

    expect(document_store.get_viewer_state("tab-1")?.pdf_page).toBe(1);
  });
});
