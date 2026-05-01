import { describe, expect, it, vi } from "vitest";
import { create_lsp_document_sync_reactor } from "$lib/reactors/lsp_document_sync.reactor.svelte";
import type { LspSyncClientConfig } from "$lib/reactors/lsp_document_sync.reactor.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

function make_editor_store(path: string | null, dirty = false) {
  return {
    open_note: path
      ? {
          meta: {
            id: as_note_path(path),
            path: as_note_path(path),
            name: path.split("/").pop()!,
            title: path.split("/").pop()!.replace(".md", ""),
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
          },
          markdown: as_markdown_text("# Test"),
          buffer_id: path,
          is_dirty: dirty,
        }
      : null,
  } as never;
}

function make_client(
  overrides?: Partial<LspSyncClientConfig>,
): LspSyncClientConfig {
  return {
    is_ready: () => true,
    debounce_ms: 300,
    on_open: vi.fn(),
    on_change: vi.fn(),
    on_save: vi.fn(),
    on_close: vi.fn(),
    ...overrides,
  };
}

describe("lsp_document_sync.reactor", () => {
  it("returns a handle with cleanup and flush", () => {
    const client = make_client();
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [client],
    );
    expect(typeof handle.cleanup).toBe("function");
    expect(typeof handle.flush).toBe("function");
    handle.cleanup();
  });

  it("accepts multiple clients", () => {
    const client_a = make_client({ debounce_ms: 500 });
    const client_b = make_client({ debounce_ms: 300 });
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [client_a, client_b],
    );
    expect(typeof handle.cleanup).toBe("function");
    expect(typeof handle.flush).toBe("function");
    handle.cleanup();
  });

  it("accepts zero clients", () => {
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [],
    );
    expect(typeof handle.cleanup).toBe("function");
    expect(typeof handle.flush).toBe("function");
    handle.cleanup();
  });

  it("accepts client with skip_draft", () => {
    const client = make_client({ skip_draft: true });
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [client],
    );
    expect(typeof handle.cleanup).toBe("function");
    handle.cleanup();
  });

  it("accepts client without optional callbacks", () => {
    const { on_save: _on_save, on_close: _on_close, ...base } = make_client();
    const client: LspSyncClientConfig = base;
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [client],
    );
    expect(typeof handle.cleanup).toBe("function");
    handle.cleanup();
  });

  it("accepts not-ready client without error", () => {
    const client = make_client({ is_ready: () => false });
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [client],
    );
    expect(typeof handle.cleanup).toBe("function");
    handle.cleanup();
  });

  it("handles null open_note", () => {
    const client = make_client();
    const handle = create_lsp_document_sync_reactor(make_editor_store(null), [
      client,
    ]);
    expect(typeof handle.cleanup).toBe("function");
    handle.cleanup();
  });

  it("flush is a no-op when no pending timer", () => {
    const client = make_client();
    const handle = create_lsp_document_sync_reactor(
      make_editor_store("notes/a.md"),
      [client],
    );
    handle.flush();
    expect(client.on_change).not.toHaveBeenCalled();
    handle.cleanup();
  });
});
