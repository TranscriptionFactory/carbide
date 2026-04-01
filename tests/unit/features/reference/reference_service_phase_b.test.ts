import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  ReferenceStoragePort,
  LinkedSourcePort,
} from "$lib/features/reference/ports";
import type {
  CslItem,
  LinkedNoteInfo,
  LinkedSourceMeta,
  ScanEntry,
} from "$lib/features/reference/types";
import { make_item, make_mock_storage, make_vault_store } from "./helpers";

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

function make_linked_note_info(
  overrides?: Partial<LinkedNoteInfo>,
): LinkedNoteInfo {
  return {
    path: "@linked/Papers/test.pdf",
    title: "Test Paper",
    mtime_ms: 1000,
    citekey: "smith2024-abc123",
    authors: "Smith, John",
    year: 2024,
    item_type: "article",
    external_file_path: "/papers/test.pdf",
    linked_source_id: "source-1",
    ...overrides,
  };
}

function make_mock_linked_source_port(
  notes: LinkedNoteInfo[] = [],
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
    query_linked_notes: vi.fn(() => Promise.resolve(notes)),
    count_linked_notes: vi.fn(() => Promise.resolve(notes.length)),
    find_by_citekey: vi.fn((_, citekey: string) => {
      const found = notes.find((n) => n.citekey === citekey);
      return Promise.resolve(found ?? null);
    }),
    search_linked_notes: vi.fn((_, query: string) => {
      const results = notes.filter(
        (n) =>
          n.title.toLowerCase().includes(query.toLowerCase()) ||
          (n.citekey?.toLowerCase().includes(query.toLowerCase()) ?? false),
      );
      return Promise.resolve(results);
    }),
    update_linked_metadata: vi.fn(() => Promise.resolve(true)),
  };
}

describe("Phase B: Library.json Migration & Reference Store Cleanup", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let ls_port: LinkedSourcePort;
  const now_ms = () => 1000;

  describe("migrate_linked_items_from_library", () => {
    it("removes linked source items from library.json on load", async () => {
      const linked_item: CslItem = {
        ...make_item("linked-1"),
        _source: "linked_source",
        _linked_source_id: "source-1",
        _linked_file_path: "/papers/test.pdf",
      };
      const manual_item = make_item("manual-1");
      storage = make_mock_storage([linked_item, manual_item]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port();

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      await service.load_library();

      expect(store.library_items).toHaveLength(1);
      expect(store.library_items[0]!.id).toBe("manual-1");
      expect(storage.save_library).toHaveBeenCalled();
    });

    it("is idempotent — no-op when no linked items exist", async () => {
      const manual_item = make_item("manual-1");
      storage = make_mock_storage([manual_item]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port();

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      await service.load_library();

      expect(store.library_items).toHaveLength(1);
      expect(storage.save_library).not.toHaveBeenCalled();
    });
  });

  describe("scan_linked_source skips library.json", () => {
    it("indexes into DB without touching library.json", async () => {
      storage = make_mock_storage([]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port();
      (ls_port.list_files as ReturnType<typeof vi.fn>).mockResolvedValue([
        { file_path: "/papers/new.pdf", modified_at: 2000 },
      ]);

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
        {
          get_vault_setting: vi.fn(() => Promise.resolve(null)),
          set_vault_setting: vi.fn(() => Promise.resolve()),
        } as never,
      );

      store.add_linked_source({
        id: "source-1",
        path: "/papers",
        name: "Papers",
        enabled: true,
        last_scan_at: null,
      });

      const result = await service.scan_linked_source("source-1");

      expect(result.added).toBe(1);
      expect(ls_port.index_content).toHaveBeenCalled();
      expect(storage.save_library).not.toHaveBeenCalled();
      expect(storage.add_item).not.toHaveBeenCalled();
    });
  });

  describe("index_linked_pdf skips library.json", () => {
    it("indexes into DB directly", async () => {
      storage = make_mock_storage([]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port();

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      store.add_linked_source({
        id: "source-1",
        path: "/papers",
        name: "Papers",
        enabled: true,
        last_scan_at: null,
      });

      await service.index_linked_pdf("source-1", "/papers/new.pdf");

      expect(ls_port.extract_file).toHaveBeenCalledWith("/papers/new.pdf");
      expect(ls_port.index_content).toHaveBeenCalled();
      expect(storage.add_item).not.toHaveBeenCalled();
    });
  });

  describe("remove_linked_source clears DB", () => {
    it("clears DB notes instead of library items", async () => {
      storage = make_mock_storage([make_item("manual-1")]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port();

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
        {
          get_vault_setting: vi.fn(() => Promise.resolve(null)),
          set_vault_setting: vi.fn(() => Promise.resolve()),
        } as never,
      );

      store.add_linked_source({
        id: "source-1",
        path: "/papers",
        name: "Papers",
        enabled: true,
        last_scan_at: null,
      });

      await service.remove_linked_source("source-1", true);

      expect(ls_port.clear_source).toHaveBeenCalledWith("test-vault", "Papers");
      expect(storage.remove_item).not.toHaveBeenCalled();
      expect(store.linked_sources).toHaveLength(0);
    });
  });

  describe("search_linked_notes", () => {
    it("queries linked notes from DB", async () => {
      const notes = [
        make_linked_note_info({ title: "AI Paper" }),
        make_linked_note_info({
          path: "@linked/Papers/other.pdf",
          title: "Other Paper",
          citekey: "doe2024-xyz",
        }),
      ];
      storage = make_mock_storage([]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port(notes);

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      const results = await service.search_linked_notes("AI");
      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("AI Paper");
    });
  });

  describe("find_by_citekey", () => {
    it("finds linked note by citekey in DB", async () => {
      const notes = [make_linked_note_info()];
      storage = make_mock_storage([]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port(notes);

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      const found = await service.find_by_citekey("smith2024-abc123");
      expect(found).not.toBeNull();
      expect(found!.title).toBe("Test Paper");
    });

    it("returns null for unknown citekey", async () => {
      storage = make_mock_storage([]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port([]);

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      const found = await service.find_by_citekey("nonexistent");
      expect(found).toBeNull();
    });
  });

  describe("count_linked_notes_for_source", () => {
    it("returns count from DB", async () => {
      const notes = [
        make_linked_note_info(),
        make_linked_note_info({ path: "@linked/Papers/b.pdf" }),
      ];
      storage = make_mock_storage([]);
      store = new ReferenceStore();
      op_store = new OpStore();
      ls_port = make_mock_linked_source_port(notes);

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
      );

      const count = await service.count_linked_notes_for_source("Papers");
      expect(count).toBe(2);
    });
  });

  describe("ReferenceStore: removed linked source methods", () => {
    it("no longer has get_linked_source_items", () => {
      const store = new ReferenceStore();
      expect("get_linked_source_items" in store).toBe(false);
    });

    it("no longer has get_all_linked_items", () => {
      const store = new ReferenceStore();
      expect("get_all_linked_items" in store).toBe(false);
    });
  });
});
