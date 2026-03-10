import { describe, expect, it } from "vitest";
import { DocumentService } from "$lib/features/document";
import { DocumentStore } from "$lib/features/document";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";

describe("DocumentService", () => {
  it("loads text content lazily into the cache", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = {
      reads: [] as string[],
      read_file: (_vault_id: string, relative_path: string) => {
        document_port.reads.push(relative_path);
        return Promise.resolve(`content:${relative_path}`);
      },
      resolve_asset_url: (_vault_id: string, relative_path: string) =>
        `asset://${relative_path}`,
    };
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
      () => 10,
      1,
    );

    await service.open_document("tab-1", "docs/demo.txt", "text");

    expect(document_port.reads).toEqual(["docs/demo.txt"]);
    expect(document_store.get_viewer_state("tab-1")?.load_status).toBe("ready");
    expect(document_store.get_content_state("tab-1")?.content).toBe(
      "content:docs/demo.txt",
    );
  });

  it("evicts inactive cached payloads while keeping metadata", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = {
      read_file: (_vault_id: string, relative_path: string) =>
        Promise.resolve(`content:${relative_path}`),
      resolve_asset_url: (_vault_id: string, relative_path: string) =>
        `asset://${relative_path}`,
    };
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
    expect(document_store.get_content_state("tab-2")?.content).toBe(
      "content:docs/two.txt",
    );
  });

  it("reuses cached ready content without re-reading", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    let read_count = 0;
    const document_port = {
      read_file: () => {
        read_count += 1;
        return Promise.resolve("content");
      },
      resolve_asset_url: () => "asset://demo",
    };
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/demo.txt", "text");
    await service.ensure_content("tab-1");

    expect(read_count).toBe(1);
  });

  it("stores the initial pdf page when opening a pdf document", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = {
      read_file: () => Promise.resolve("content"),
      resolve_asset_url: () => "asset://demo",
    };
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
    const document_port = {
      read_file: () => Promise.resolve("content"),
      resolve_asset_url: () => "asset://demo",
    };
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/demo.pdf", "pdf", 0);

    expect(document_store.get_viewer_state("tab-1")?.pdf_page).toBe(1);
  });
});
