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
      delete_file: vi.fn().mockResolvedValue(undefined),
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
      undefined,
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
      undefined,
    );
    expect(document_store.get_content_state("tab-1")?.content).toBe(
      "file content here",
    );

    await service.open_document("tab-2", "scripts/demo.py", "text");

    expect(document_port.read_file).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "scripts/demo.py",
      undefined,
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
      delete_file: vi.fn().mockResolvedValue(undefined),
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

  describe("save_html_artifact", () => {
    it("writes the html file and a sidecar provenance file", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      const result = await service.save_html_artifact(
        "docs",
        "<title>Chart</title>",
        new Date("2026-05-29T12:34:56Z"),
      );

      expect(result?.html_path).toMatch(/^docs\/chart-\d{8}-\d{6}\.html$/);
      expect(result?.meta_path).toBe(`${result?.html_path}.meta.json`);
      expect(document_port.write_file).toHaveBeenCalledTimes(2);
      const html_call = document_port.write_file.mock.calls[0]!;
      const meta_call = document_port.write_file.mock.calls[1]!;
      expect(html_call[1]).toBe(result?.html_path);
      expect(html_call[2]).toBe("<title>Chart</title>");
      expect(meta_call[1]).toBe(result?.meta_path);
      const meta_payload = JSON.parse(meta_call[2]);
      expect(meta_payload.source).toBe("clipboard");
      expect(meta_payload.pasted_at).toBe("2026-05-29T12:34:56.000Z");
    });

    it("returns null when no vault is open", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      const result = await service.save_html_artifact("", "<p>x</p>");
      expect(result).toBe(null);
      expect(document_port.write_file).not.toHaveBeenCalled();
    });

    it("writes to vault root when folder is empty", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      const result = await service.save_html_artifact(
        "",
        "<title>Root</title>",
        new Date("2026-05-29T12:34:56Z"),
      );

      expect(result?.html_path).toMatch(/^root-\d{8}-\d{6}\.html$/);
      expect(result?.html_path.includes("/")).toBe(false);
    });
  });

  describe("read_provenance", () => {
    it("reads and parses the sidecar metadata", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      document_port.read_file.mockResolvedValue(
        '{"source":"clipboard","pasted_at":"2026-05-29T00:00:00Z"}',
      );
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      const meta = await service.read_provenance("docs/chart.html");
      expect(meta?.source).toBe("clipboard");
      expect(document_port.read_file).toHaveBeenCalledWith(
        vault_store.vault?.id,
        "docs/chart.html.meta.json",
      );
    });

    it("returns null when the sidecar file is missing", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      document_port.read_file.mockRejectedValue("missing");
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      const meta = await service.read_provenance("docs/chart.html");
      expect(meta).toBe(null);
    });
  });

  describe("refresh_provenance", () => {
    it("hydrates the document store with provenance", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      document_port.read_file.mockResolvedValue(
        '{"source":"clipboard","pasted_at":"2026-05-29T00:00:00Z"}',
      );
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      await service.refresh_provenance("docs/chart.html");
      expect(document_store.get_provenance("docs/chart.html")?.source).toBe(
        "clipboard",
      );
    });

    it("stores null when the sidecar is missing", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      document_port.read_file.mockRejectedValue("missing");
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      await service.refresh_provenance("docs/chart.html");
      expect(document_store.get_provenance("docs/chart.html")).toBe(null);
    });
  });

  describe("trusted html", () => {
    function create_trusted_port() {
      return {
        get_level: vi.fn().mockResolvedValue("safe" as const),
        list: vi.fn().mockResolvedValue([]),
        grant: vi.fn().mockResolvedValue(undefined),
        revoke: vi.fn().mockResolvedValue(undefined),
        parent_folder: vi.fn().mockResolvedValue(""),
      };
    }

    it("list_trusted_html forwards to the port for the active vault", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const trusted_port = create_trusted_port();
      trusted_port.list.mockResolvedValue([
        { path: "a.html", scope: "file", level: "live" },
        { path: "trusted/", scope: "folder", level: "live+net" },
      ]);
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
        undefined,
        undefined,
        undefined,
        trusted_port,
      );

      const entries = await service.list_trusted_html();
      expect(trusted_port.list).toHaveBeenCalledWith(vault_store.vault?.id);
      expect(entries).toEqual([
        { path: "a.html", scope: "file", level: "live" },
        { path: "trusted/", scope: "folder", level: "live+net" },
      ]);
    });

    it("list_trusted_html returns empty when no vault is open", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      const document_port = create_document_port();
      const trusted_port = create_trusted_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
        undefined,
        undefined,
        undefined,
        trusted_port,
      );

      const entries = await service.list_trusted_html();
      expect(entries).toEqual([]);
      expect(trusted_port.list).not.toHaveBeenCalled();
    });

    it("revoke_trust forwards to port and clears the trust cache", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const trusted_port = create_trusted_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
        undefined,
        undefined,
        undefined,
        trusted_port,
      );
      document_store.set_trust_level("a.html", "live");
      expect(document_store.get_trust_level("a.html")).toBe("live");

      await service.revoke_trust("a.html", "file");

      expect(trusted_port.revoke).toHaveBeenCalledWith(
        vault_store.vault?.id,
        "a.html",
        "file",
      );
      expect(document_store.get_trust_level("a.html")).toBe("safe");
    });
  });

  describe("clear_provenance", () => {
    it("deletes the sidecar and clears in-memory state", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );
      document_store.set_provenance("docs/chart.html", {
        source: "clipboard",
        pasted_at: "2026-05-29T00:00:00Z",
      });

      await service.clear_provenance("docs/chart.html");
      expect(document_port.delete_file).toHaveBeenCalledWith(
        vault_store.vault?.id,
        "docs/chart.html.meta.json",
      );
      expect(document_store.get_provenance("docs/chart.html")).toBe(null);
    });

    it("still clears in-memory state if delete fails", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      document_port.delete_file.mockRejectedValue("not found");
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );
      document_store.set_provenance("docs/chart.html", {
        source: "clipboard",
        pasted_at: "2026-05-29T00:00:00Z",
      });

      await service.clear_provenance("docs/chart.html");
      expect(document_store.get_provenance("docs/chart.html")).toBe(null);
    });
  });

  describe("get_document_ai_context", () => {
    function setup_doc(
      tab_id: string,
      file_path: string,
      file_type: "html" | "text" | "csv",
      content: string | null,
      html_view_mode: "source" | "safe" | "live" = "source",
    ) {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );
      document_store.set_viewer_state(tab_id, {
        tab_id,
        file_path,
        file_type,
        zoom: 1,
        scroll_top: 0,
        pdf_page: 1,
        cfi: null,
        html_view_mode,
        load_status: content === null ? "loading" : "ready",
        error_message: null,
      });
      if (content !== null) {
        document_store.set_content_state(tab_id, {
          tab_id,
          file_path,
          file_type,
          status: "ready",
          error_message: null,
          content,
          edited_content: null,
          is_dirty: false,
          buffer_id: null,
          line_count: content.split("\n").length,
          asset_url: null,
          last_accessed_at: 0,
          pdf_metadata: null,
        });
      }
      return { service, document_store };
    }

    it("returns a context for an html document", () => {
      const { service } = setup_doc(
        "tab-html",
        "notes/chart.html",
        "html",
        "<html><body>x</body></html>",
      );

      const ctx = service.get_document_ai_context("tab-html");

      expect(ctx).toEqual({
        tab_id: "tab-html",
        file_path: "notes/chart.html",
        file_title: "chart",
        content: "<html><body>x</body></html>",
      });
    });

    it("returns a context for an html document in Live mode", () => {
      const { service } = setup_doc(
        "tab-html",
        "notes/chart.html",
        "html",
        "<p>x</p>",
        "live",
      );

      expect(service.get_document_ai_context("tab-html")?.content).toBe(
        "<p>x</p>",
      );
    });

    it("returns a context for a text document", () => {
      const { service } = setup_doc(
        "tab-text",
        "scripts/build.py",
        "text",
        "print('x')",
      );

      const ctx = service.get_document_ai_context("tab-text");

      expect(ctx).toEqual({
        tab_id: "tab-text",
        file_path: "scripts/build.py",
        file_title: "build",
        content: "print('x')",
      });
    });

    it("prefers edited_content over content", () => {
      const { service, document_store } = setup_doc(
        "tab-html",
        "notes/chart.html",
        "html",
        "<p>old</p>",
      );
      document_store.set_edited_content("tab-html", "<p>new</p>");

      const ctx = service.get_document_ai_context("tab-html");

      expect(ctx?.content).toBe("<p>new</p>");
    });

    it("returns null for non-editable document types", () => {
      const { service } = setup_doc("tab-csv", "data/rows.csv", "csv", "a,b");

      expect(service.get_document_ai_context("tab-csv")).toBeNull();
    });

    it("returns null when content has not loaded", () => {
      const { service } = setup_doc(
        "tab-html",
        "notes/chart.html",
        "html",
        null,
      );

      expect(service.get_document_ai_context("tab-html")).toBeNull();
    });
  });

  describe("apply_document_ai_output", () => {
    function setup_doc(
      tab_id: string,
      file_path: string,
      file_type: "html" | "text",
      content: string,
    ) {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );
      document_store.set_viewer_state(tab_id, {
        tab_id,
        file_path,
        file_type,
        zoom: 1,
        scroll_top: 0,
        pdf_page: 1,
        cfi: null,
        html_view_mode: "source",
        load_status: "ready",
        error_message: null,
      });
      document_store.set_content_state(tab_id, {
        tab_id,
        file_path,
        file_type,
        status: "ready",
        error_message: null,
        content,
        edited_content: null,
        is_dirty: false,
        buffer_id: null,
        line_count: content.split("\n").length,
        asset_url: null,
        last_accessed_at: 0,
        pdf_metadata: null,
      });
      return { service, document_store };
    }

    it("writes through document_store.set_edited_content and marks dirty", () => {
      const { service, document_store } = setup_doc(
        "tab-html",
        "notes/chart.html",
        "html",
        "<p>old</p>",
      );

      const applied = service.apply_document_ai_output(
        "tab-html",
        "<p>new</p>",
      );

      expect(applied).toBe(true);
      const state = document_store.get_content_state("tab-html");
      expect(state?.edited_content).toBe("<p>new</p>");
      expect(state?.is_dirty).toBe(true);
    });

    it("applies output to a text document", () => {
      const { service, document_store } = setup_doc(
        "tab-text",
        "scripts/build.py",
        "text",
        "print('x')",
      );

      const applied = service.apply_document_ai_output(
        "tab-text",
        "print('y')",
      );

      expect(applied).toBe(true);
      expect(document_store.get_content_state("tab-text")?.edited_content).toBe(
        "print('y')",
      );
    });

    it("returns false when the tab is not an editable document", () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const document_port = create_document_port();
      const service = new DocumentService(
        document_port,
        vault_store,
        document_store,
      );

      expect(service.apply_document_ai_output("missing-tab", "<p>x</p>")).toBe(
        false,
      );
    });
  });

  describe("reading position", () => {
    function create_reading_position_port(saved: string | null = null) {
      return {
        get: vi.fn().mockResolvedValue(saved),
        set: vi.fn().mockResolvedValue(undefined),
      };
    }

    function make_service(
      document_store: DocumentStore,
      vault_store: VaultStore,
      reading_position_port: ReturnType<typeof create_reading_position_port>,
    ) {
      return new DocumentService(
        create_document_port(),
        vault_store,
        document_store,
        () => 10,
        3,
        undefined,
        undefined,
        reading_position_port,
      );
    }

    it("seeds cfi from the reading position port when opening an epub", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const port = create_reading_position_port("epubcfi(/6/4!/4/2)");
      const service = make_service(document_store, vault_store, port);

      await service.open_document("tab-epub", "books/a.epub", "epub");

      expect(port.get).toHaveBeenCalledWith(
        vault_store.vault?.id,
        "books/a.epub",
      );
      expect(document_store.get_viewer_state("tab-epub")?.cfi).toBe(
        "epubcfi(/6/4!/4/2)",
      );
    });

    it("prefers an explicit initial_cfi over the saved position", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const port = create_reading_position_port("epubcfi(saved)");
      const service = make_service(document_store, vault_store, port);

      await service.open_document(
        "tab-epub",
        "books/a.epub",
        "epub",
        undefined,
        "epubcfi(explicit)",
      );

      expect(port.get).not.toHaveBeenCalled();
      expect(document_store.get_viewer_state("tab-epub")?.cfi).toBe(
        "epubcfi(explicit)",
      );
    });

    it("leaves cfi null and skips the port for non-epub documents", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const port = create_reading_position_port("epubcfi(saved)");
      const service = make_service(document_store, vault_store, port);

      await service.open_document("tab-pdf", "docs/paper.pdf", "pdf");

      expect(port.get).not.toHaveBeenCalled();
      expect(document_store.get_viewer_state("tab-pdf")?.cfi).toBeNull();
    });

    it("save_reading_position writes through the port and updates the store", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const port = create_reading_position_port();
      const service = make_service(document_store, vault_store, port);

      await service.open_document("tab-epub", "books/a.epub", "epub");
      await service.save_reading_position("tab-epub", "epubcfi(/6/8!/2)");

      expect(port.set).toHaveBeenCalledWith(
        vault_store.vault?.id,
        "books/a.epub",
        "epubcfi(/6/8!/2)",
      );
      expect(document_store.get_viewer_state("tab-epub")?.cfi).toBe(
        "epubcfi(/6/8!/2)",
      );
    });

    it("save_reading_position is a no-op for non-epub tabs", async () => {
      const document_store = new DocumentStore();
      const vault_store = new VaultStore();
      vault_store.vault = create_test_vault();
      const port = create_reading_position_port();
      const service = make_service(document_store, vault_store, port);

      await service.open_document("tab-pdf", "docs/paper.pdf", "pdf");
      await service.save_reading_position("tab-pdf", "epubcfi(x)");

      expect(port.set).not.toHaveBeenCalled();
    });
  });
});
