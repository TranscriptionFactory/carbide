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
      read_file: vi.fn().mockResolvedValue("file content here"),
      write_file: vi.fn().mockResolvedValue(undefined),
    };
  }

  it("reads file content for text documents", async () => {
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

    expect(document_port.read_file).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "docs/demo.txt",
    );
    expect(document_store.get_viewer_state("tab-1")?.load_status).toBe("ready");
    expect(document_store.get_content_state("tab-1")?.content).toBe(
      "file content here",
    );
  });

  it("reads file content for all text-type documents (html, code collapsed to text)", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "docs/page.html", "text");

    expect(document_port.read_file).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "docs/page.html",
    );
    expect(document_store.get_content_state("tab-1")?.content).toBe(
      "file content here",
    );

    await service.open_document("tab-2", "scripts/demo.py", "text");

    expect(document_port.read_file).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "scripts/demo.py",
    );
    expect(document_store.get_content_state("tab-2")?.content).toBe(
      "file content here",
    );
  });

  it("surfaces error message from string rejections", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();
    const document_port = create_document_port();
    document_port.read_file.mockRejectedValue("file exceeds 5 MB limit");
    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
    );

    await service.open_document("tab-1", "big.bin", "text");

    expect(document_store.get_viewer_state("tab-1")?.load_status).toBe("error");
    expect(document_store.get_viewer_state("tab-1")?.error_message).toBe(
      "file exceeds 5 MB limit",
    );
  });

  it("evicts inactive cached content while keeping metadata", async () => {
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
    expect(document_store.get_content_state("tab-2")?.content).toBe(
      "file content here",
    );
  });

  it("does not evict dirty content states", async () => {
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
    document_store.set_edited_content("tab-1", "unsaved edits");
    await service.open_document("tab-2", "docs/two.txt", "text");

    service.sync_open_tabs("tab-2", ["tab-1", "tab-2"]);

    expect(document_store.get_content_state("tab-1")).toBeDefined();
    expect(document_store.get_content_state("tab-1")?.is_dirty).toBe(true);
  });

  it("reuses cached ready content without re-reading", async () => {
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

    expect(document_port.read_file).toHaveBeenCalledTimes(1);
  });

  it("clears state when the document is closed", async () => {
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

  it("discards stale ensure_content results when viewer file_path changes", async () => {
    const document_store = new DocumentStore();
    const vault_store = new VaultStore();
    vault_store.vault = create_test_vault();

    let resolve_first!: (value: string) => void;
    const first_promise = new Promise<string>((r) => {
      resolve_first = r;
    });

    let call_count = 0;
    const document_port = {
      open_buffer: vi.fn().mockResolvedValue(123),
      read_buffer_window: vi.fn().mockResolvedValue(""),
      close_buffer: vi.fn().mockResolvedValue(undefined),
      resolve_asset_url: vi.fn((_: string, p: string) => `asset://${p}`),
      read_file: vi.fn().mockImplementation(() => {
        call_count++;
        if (call_count === 1) return first_promise;
        return Promise.resolve("second content");
      }),
      write_file: vi.fn().mockResolvedValue(undefined),
    };

    const service = new DocumentService(
      document_port,
      vault_store,
      document_store,
      () => 10,
      5,
    );

    const first_open = service.open_document("tab-1", "docs/first.txt", "text");

    document_store.remove_viewer_state("tab-1");
    document_store.clear_content_state("tab-1");

    await service.open_document("tab-1", "docs/second.txt", "text");
    expect(document_store.get_content_state("tab-1")?.content).toBe(
      "second content",
    );

    resolve_first("first content");
    await first_open;

    const content_state = document_store.get_content_state("tab-1");
    expect(content_state?.content).toBe("second content");
  });

  it("saves edited content and resets dirty state", async () => {
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
    document_store.set_edited_content("tab-1", "updated content");

    expect(document_store.get_content_state("tab-1")?.is_dirty).toBe(true);

    await service.save("tab-1");

    expect(document_port.write_file).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "docs/demo.txt",
      "updated content",
    );
    expect(document_store.get_content_state("tab-1")?.is_dirty).toBe(false);
    expect(
      document_store.get_content_state("tab-1")?.edited_content,
    ).toBeNull();
    expect(document_store.get_content_state("tab-1")?.content).toBe(
      "updated content",
    );
  });

  it("save is a no-op when content is not dirty", async () => {
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
    await service.save("tab-1");

    expect(document_port.write_file).not.toHaveBeenCalled();
  });

  it("current_content returns edited_content over loaded content", async () => {
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
    expect(document_store.get_current_content("tab-1")).toBe(
      "file content here",
    );

    document_store.set_edited_content("tab-1", "edited version");
    expect(document_store.get_current_content("tab-1")).toBe("edited version");
  });
});
