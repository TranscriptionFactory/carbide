/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { create_lsp_document_sync_reactor } from "$lib/reactors/lsp_document_sync.reactor.svelte";
import type { LspSyncClientConfig } from "$lib/reactors/lsp_document_sync.reactor.svelte";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import {
  create_editor_store,
  make_open_note,
} from "./fixtures/lsp_document_sync_stores.svelte";

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

describe("lsp_document_sync.reactor skip_draft", () => {
  const DRAFT = "draft:1787696876794:2026-08-25_182756";

  function mount(
    path: string | null,
    client = make_client({ skip_draft: true }),
  ) {
    const store = create_editor_store(path);
    const handle = create_lsp_document_sync_reactor(store as never, [client]);
    flushSync();
    const set_path = (next: string | null, dirty = false) => {
      store.open_note = next ? make_open_note(next, dirty) : null;
      flushSync();
    };
    return { client, handle, set_path };
  }

  it("sends nothing to the client while a draft is open", () => {
    const { client, handle } = mount(DRAFT);
    expect(client.on_open).not.toHaveBeenCalled();
    expect(client.on_change).not.toHaveBeenCalled();
    expect(client.on_save).not.toHaveBeenCalled();
    expect(client.on_close).not.toHaveBeenCalled();
    handle.cleanup();
  });

  it("never closes a draft when switching away from it", () => {
    const { client, handle, set_path } = mount("notes/a.md");
    expect(client.on_open).toHaveBeenCalledWith("notes/a.md", "# Test");

    set_path(DRAFT);
    set_path("notes/b.md");

    const closed_paths = vi.mocked(client.on_close).mock.calls.map(
      ([path]) => path,
    );
    expect(closed_paths).toEqual(["notes/a.md"]);
    expect(client.on_open).toHaveBeenCalledWith("notes/b.md", "# Test");
    handle.cleanup();
  });

  it("sends no changes for a dirty draft after the debounce", () => {
    vi.useFakeTimers();
    try {
      const { client, handle, set_path } = mount("notes/a.md");
      set_path(DRAFT, true);
      vi.advanceTimersByTime(300);
      expect(client.on_change).not.toHaveBeenCalled();
      handle.cleanup();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps syncing real notes for a skip_draft client", () => {
    vi.useFakeTimers();
    try {
      const { client, handle, set_path } = mount("notes/a.md");
      set_path("notes/b.md", true);
      vi.advanceTimersByTime(300);
      expect(client.on_open).toHaveBeenCalledWith("notes/b.md", "# Test");
      expect(client.on_change).toHaveBeenCalledWith("notes/b.md", "# Test");
      handle.cleanup();
    } finally {
      vi.useRealTimers();
    }
  });
});
