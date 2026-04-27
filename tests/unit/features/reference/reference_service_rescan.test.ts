import { describe, it, expect, vi } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { LinkedSourcePort } from "$lib/features/reference/ports";
import type { LinkedSource, ScanEntry } from "$lib/features/reference/types";
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

function make_mock_linked_source_port(): LinkedSourcePort {
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

describe("rescan_all_enabled_sources", () => {
  it("scans each enabled source sequentially", async () => {
    const store = new ReferenceStore();
    const ls_port = make_mock_linked_source_port();

    const service = new ReferenceService(
      make_mock_storage(),
      store,
      make_vault_store(),
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

    store.add_linked_source(make_source({ id: "s1", name: "Papers" }));
    store.add_linked_source(
      make_source({ id: "s2", name: "Books", enabled: false }),
    );
    store.add_linked_source(
      make_source({ id: "s3", name: "Reports", path: "/reports" }),
    );

    const scan_spy = vi.spyOn(service, "scan_linked_source");

    await service.rescan_all_enabled_sources();

    expect(scan_spy).toHaveBeenCalledTimes(2);
    expect(scan_spy).toHaveBeenCalledWith("s1");
    expect(scan_spy).toHaveBeenCalledWith("s3");
    expect(scan_spy).not.toHaveBeenCalledWith("s2");
  });

  it("does nothing when no sources exist", async () => {
    const store = new ReferenceStore();
    const ls_port = make_mock_linked_source_port();

    const service = new ReferenceService(
      make_mock_storage(),
      store,
      make_vault_store(),
      new OpStore(),
      () => 1000,
      null,
      null,
      ls_port,
    );

    const scan_spy = vi.spyOn(service, "scan_linked_source");

    await service.rescan_all_enabled_sources();

    expect(scan_spy).not.toHaveBeenCalled();
  });
});
