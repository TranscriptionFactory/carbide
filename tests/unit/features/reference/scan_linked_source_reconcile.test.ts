import { describe, it, expect, vi } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { LinkedSourcePort } from "$lib/features/reference/ports";
import type {
  LinkedNoteInfo,
  LinkedSource,
  ScanEntry,
} from "$lib/features/reference/types";
import { make_mock_storage, make_vault_store } from "./helpers";

function make_scan_entry(overrides?: Partial<ScanEntry>): ScanEntry {
  return {
    file_path: "/papers/test.pdf",
    file_name: "test.pdf",
    file_type: "pdf",
    title: "Test Paper",
    author: "Smith, John",
    subject: null,
    keywords: null,
    doi: null,
    isbn: null,
    arxiv_id: null,
    creation_date: null,
    body_text: "some extracted text",
    page_offsets: [0],
    modified_at: 1000,
    ...overrides,
  };
}

function make_linked_note(overrides?: Partial<LinkedNoteInfo>): LinkedNoteInfo {
  return {
    path: "@linked/Papers/test",
    title: "Test Paper",
    mtime_ms: 1000,
    external_file_path: "/old/papers/test.pdf",
    ...overrides,
  };
}

function make_mock_linked_source_port(
  overrides?: Partial<LinkedSourcePort>,
): LinkedSourcePort {
  return {
    scan_folder: vi.fn(() => Promise.resolve([])),
    extract_file: vi.fn((path: string) =>
      Promise.resolve(make_scan_entry({ file_path: path })),
    ),
    list_files: vi.fn(() => Promise.resolve([])),
    index_content: vi.fn(() => Promise.resolve()),
    remove_content: vi.fn(() => Promise.resolve()),
    clear_source: vi.fn(() => Promise.resolve()),
    query_linked_notes: vi.fn(() => Promise.resolve([])),
    count_linked_notes: vi.fn(() => Promise.resolve(0)),
    find_by_citekey: vi.fn(() => Promise.resolve(null)),
    search_linked_notes: vi.fn(() => Promise.resolve([])),
    update_linked_metadata: vi.fn(() => Promise.resolve(true)),
    resolve_home_dir: vi.fn(() => Promise.resolve("/Users/test")),
    resolve_linked_note_file_path: vi.fn(() => Promise.resolve(null)),
    ...overrides,
  };
}

function make_source(overrides?: Partial<LinkedSource>): LinkedSource {
  return {
    id: "source-1",
    path: "/papers",
    name: "Papers",
    enabled: true,
    last_scan_at: null,
    ...overrides,
  };
}

function make_service(
  store: ReferenceStore,
  ls_port: LinkedSourcePort,
  vault_path = "/tmp/test",
) {
  return new ReferenceService(
    make_mock_storage(),
    store,
    { vault: { id: "test-vault", path: vault_path } } as never,
    new OpStore(),
    () => 1000,
    null,
    null,
    ls_port,
    {
      get_vault_setting: vi.fn(() => Promise.resolve(null)),
      set_vault_setting: vi.fn(() => Promise.resolve()),
    } as never,
  );
}

describe("scan_linked_source path reconciliation", () => {
  it("relocates file via vault-relative path when absolute path changes", async () => {
    // Old layout: vault at /old/root/vault, papers at /old/root/papers
    // New layout: vault at /new/root/vault, papers at /new/root/papers
    // vault-relative path "../papers/test.pdf" is stable across both
    const existing_note = make_linked_note({
      external_file_path: "/old/root/papers/test.pdf",
      vault_relative_path: "../papers/test.pdf",
    });

    const ls_port = make_mock_linked_source_port({
      list_files: vi.fn(() =>
        Promise.resolve([
          { file_path: "/new/root/papers/test.pdf", modified_at: 1000 },
        ]),
      ),
      query_linked_notes: vi.fn(() => Promise.resolve([existing_note])),
    });

    const store = new ReferenceStore();
    store.add_linked_source(make_source());
    const service = make_service(store, ls_port, "/new/root/vault");

    const result = await service.scan_linked_source("source-1");

    expect(ls_port.update_linked_metadata).toHaveBeenCalledWith(
      "test-vault",
      "Papers",
      "/old/root/papers/test.pdf",
      expect.objectContaining({
        external_file_path: "/new/root/papers/test.pdf",
      }),
    );
    expect(ls_port.remove_content).not.toHaveBeenCalled();
    expect(ls_port.extract_file).not.toHaveBeenCalled();
    expect(result.added).toBe(0);
  });

  it("does not create duplicate when file is matched by vault-relative path in initial lookup", async () => {
    const existing_note = make_linked_note({
      external_file_path: "/new/root/papers/test.pdf",
      vault_relative_path: "../../papers/test.pdf",
      mtime_ms: 1000,
    });

    const ls_port = make_mock_linked_source_port({
      list_files: vi.fn(() =>
        Promise.resolve([
          { file_path: "/new/root/papers/test.pdf", modified_at: 1000 },
        ]),
      ),
      query_linked_notes: vi.fn(() => Promise.resolve([existing_note])),
    });

    const store = new ReferenceStore();
    store.add_linked_source(make_source());
    const service = make_service(store, ls_port, "/new/root/vault");

    const result = await service.scan_linked_source("source-1");

    expect(ls_port.extract_file).not.toHaveBeenCalled();
    expect(ls_port.remove_content).not.toHaveBeenCalled();
    expect(result.added).toBe(0);
  });

  it("removes content when file is truly gone and has no relative path to resolve", async () => {
    const existing_note = make_linked_note({
      external_file_path: "/old/papers/test.pdf",
    });

    const ls_port = make_mock_linked_source_port({
      list_files: vi.fn(() => Promise.resolve([])),
      query_linked_notes: vi.fn(() => Promise.resolve([existing_note])),
    });

    const store = new ReferenceStore();
    store.add_linked_source(make_source());
    const service = make_service(store, ls_port);

    await service.scan_linked_source("source-1");

    expect(ls_port.remove_content).toHaveBeenCalledWith(
      "test-vault",
      "Papers",
      "/old/papers/test.pdf",
    );
  });

  it("re-scan is idempotent when paths are unchanged", async () => {
    const existing_note = make_linked_note({
      external_file_path: "/papers/test.pdf",
      vault_relative_path: "../../papers/test.pdf",
      mtime_ms: 1000,
    });

    const ls_port = make_mock_linked_source_port({
      list_files: vi.fn(() =>
        Promise.resolve([{ file_path: "/papers/test.pdf", modified_at: 1000 }]),
      ),
      query_linked_notes: vi.fn(() => Promise.resolve([existing_note])),
    });

    const store = new ReferenceStore();
    store.add_linked_source(make_source());
    const service = make_service(store, ls_port);

    const result = await service.scan_linked_source("source-1");

    expect(ls_port.extract_file).not.toHaveBeenCalled();
    expect(ls_port.remove_content).not.toHaveBeenCalled();
    expect(ls_port.update_linked_metadata).not.toHaveBeenCalled();
    expect(result.added).toBe(0);
  });

  it("relocates via home-relative path when vault-relative is unavailable", async () => {
    const existing_note = make_linked_note({
      external_file_path: "/old/Users/test/papers/test.pdf",
      home_relative_path: "~/papers/test.pdf",
    });

    const ls_port = make_mock_linked_source_port({
      list_files: vi.fn(() =>
        Promise.resolve([
          { file_path: "/Users/test/papers/test.pdf", modified_at: 1000 },
        ]),
      ),
      query_linked_notes: vi.fn(() => Promise.resolve([existing_note])),
    });

    const store = new ReferenceStore();
    store.add_linked_source(make_source());
    const service = make_service(store, ls_port);

    const result = await service.scan_linked_source("source-1");

    expect(ls_port.update_linked_metadata).toHaveBeenCalledWith(
      "test-vault",
      "Papers",
      "/old/Users/test/papers/test.pdf",
      expect.objectContaining({
        external_file_path: "/Users/test/papers/test.pdf",
      }),
    );
    expect(ls_port.remove_content).not.toHaveBeenCalled();
    expect(ls_port.extract_file).not.toHaveBeenCalled();
    expect(result.added).toBe(0);
  });
});
