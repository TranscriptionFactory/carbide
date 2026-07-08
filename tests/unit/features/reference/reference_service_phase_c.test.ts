import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  ReferenceStoragePort,
  LinkedSourcePort,
} from "$lib/features/reference/ports";
import type {
  LinkedNoteInfo,
  LinkedSource,
  LinkedSourceMeta,
  ScanEntry,
} from "$lib/features/reference/types";
import type { VaultSettingsPort } from "$lib/features/vault";
import { make_mock_storage, make_vault_store } from "./helpers";

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
      Promise.resolve({
        file_path: path,
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
        body_text: "some text",
        page_offsets: [0],
        modified_at: 1000,
      } satisfies ScanEntry),
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
    search_linked_notes: vi.fn(() => Promise.resolve([])),
    update_linked_metadata: vi.fn(() => Promise.resolve(true)),
    resolve_home_dir: vi.fn(() => Promise.resolve("/Users/test")),
    resolve_linked_note_file_path: vi.fn(() => Promise.resolve(null)),
  };
}

function make_mock_vault_settings_port(
  sources: LinkedSource[] = [],
): VaultSettingsPort {
  return {
    get_vault_setting: vi.fn(
      async () => sources,
    ) as VaultSettingsPort["get_vault_setting"],
    set_vault_setting: vi.fn(async () => {}),
    get_local_setting: vi.fn(
      async () => null,
    ) as VaultSettingsPort["get_local_setting"],
    set_local_setting: vi.fn(async () => {}),
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

describe("Phase C: Source Unavailability Handling", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let ls_port: LinkedSourcePort;
  let vault_settings: VaultSettingsPort;
  const now_ms = () => 1000;

  beforeEach(() => {
    storage = make_mock_storage([]);
    store = new ReferenceStore();
    op_store = new OpStore();
  });

  describe("verify_linked_sources", () => {
    it("detects missing source folders and populates store", async () => {
      const source = make_source();
      vault_settings = make_mock_vault_settings_port([source]);
      const notes = [make_linked_note_info()];
      ls_port = make_mock_linked_source_port(notes);
      (ls_port.list_files as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("not a directory: /papers"),
      );

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
        vault_settings,
      );

      await service.verify_linked_sources();

      expect(store.missing_linked_sources).toHaveLength(1);
      expect(store.missing_linked_sources[0]!.source.id).toBe("source-1");
      expect(store.missing_linked_sources[0]!.item_count).toBe(1);
    });

    it("does not flag available sources as missing", async () => {
      const source = make_source();
      vault_settings = make_mock_vault_settings_port([source]);
      ls_port = make_mock_linked_source_port();
      (ls_port.list_files as ReturnType<typeof vi.fn>).mockResolvedValue([
        { file_path: "/papers/test.pdf", modified_at: 1000 },
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
        vault_settings,
      );

      await service.verify_linked_sources();

      expect(store.missing_linked_sources).toHaveLength(0);
    });

    it("resolves via vault-relative anchor when home-anchored path is missing", async () => {
      const source = make_source({
        path: "/Users/aar126/CLOUD/_CPCB/JishnuLab/4_PAPERS",
        home_relative_path: "~/CLOUD/_CPCB/JishnuLab/4_PAPERS",
        vault_relative_path: "../4_PAPERS",
      });
      vault_settings = make_mock_vault_settings_port([source]);
      ls_port = make_mock_linked_source_port();
      (ls_port.resolve_home_dir as ReturnType<typeof vi.fn>).mockResolvedValue(
        "/Users/abir",
      );
      (ls_port.list_files as ReturnType<typeof vi.fn>).mockImplementation(
        (path: string) =>
          path === "/Users/abir/CLOUD/JishnuLab/4_PAPERS"
            ? Promise.resolve([])
            : Promise.reject(new Error(`not a directory: ${path}`)),
      );

      const service = new ReferenceService(
        storage,
        store,
        {
          vault: {
            id: "test-vault",
            path: "/Users/abir/CLOUD/JishnuLab/VAULT",
          },
        } as never,
        op_store,
        now_ms,
        null,
        null,
        ls_port,
        vault_settings,
      );

      await service.verify_linked_sources();

      expect(store.missing_linked_sources).toHaveLength(0);
      const updated = store.linked_sources.find((s) => s.id === "source-1");
      expect(updated?.path).toBe("/Users/abir/CLOUD/JishnuLab/4_PAPERS");
      expect(updated?.home_relative_path).toBe("~/CLOUD/JishnuLab/4_PAPERS");
      expect(updated?.vault_relative_path).toBe("../4_PAPERS");
      expect(vault_settings.set_vault_setting).toHaveBeenCalled();
    });

    it("backfills vault_relative_path for a source found via home anchor", async () => {
      const source = make_source({
        path: "/Users/aar126/CLOUD/JishnuLab/4_PAPERS",
        home_relative_path: "~/CLOUD/JishnuLab/4_PAPERS",
      });
      vault_settings = make_mock_vault_settings_port([source]);
      ls_port = make_mock_linked_source_port();
      (ls_port.resolve_home_dir as ReturnType<typeof vi.fn>).mockResolvedValue(
        "/Users/abir",
      );
      (ls_port.list_files as ReturnType<typeof vi.fn>).mockImplementation(
        (path: string) =>
          path === "/Users/abir/CLOUD/JishnuLab/4_PAPERS"
            ? Promise.resolve([])
            : Promise.reject(new Error(`not a directory: ${path}`)),
      );

      const service = new ReferenceService(
        storage,
        store,
        {
          vault: {
            id: "test-vault",
            path: "/Users/abir/CLOUD/JishnuLab/VAULT",
          },
        } as never,
        op_store,
        now_ms,
        null,
        null,
        ls_port,
        vault_settings,
      );

      await service.verify_linked_sources();

      expect(store.missing_linked_sources).toHaveLength(0);
      const updated = store.linked_sources.find((s) => s.id === "source-1");
      expect(updated?.vault_relative_path).toBe("../4_PAPERS");
    });

    it("skips disabled sources during verification", async () => {
      const source = make_source({ enabled: false });
      vault_settings = make_mock_vault_settings_port([source]);
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
        vault_settings,
      );

      await service.verify_linked_sources();

      expect(store.missing_linked_sources).toHaveLength(0);
      expect(ls_port.list_files).not.toHaveBeenCalled();
    });
  });

  describe("relocate_linked_source", () => {
    it("updates path, saves, and dismisses missing status", async () => {
      const source = make_source();
      vault_settings = make_mock_vault_settings_port([source]);
      ls_port = make_mock_linked_source_port();
      (ls_port.list_files as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        ls_port,
        vault_settings,
      );

      store.set_linked_sources([source]);
      store.set_missing_linked_sources([{ source, item_count: 5 }]);

      await service.relocate_linked_source("source-1", "/new/papers");

      const updated = store.linked_sources.find((s) => s.id === "source-1");
      expect(updated?.path).toBe("/new/papers");
      expect(store.missing_linked_sources).toHaveLength(0);
      expect(vault_settings.set_vault_setting).toHaveBeenCalled();
    });
  });

  describe("delete_linked_source_data", () => {
    it("clears DB data, removes source, and dismisses missing status", async () => {
      const source = make_source();
      vault_settings = make_mock_vault_settings_port([source]);
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
        vault_settings,
      );

      store.set_linked_sources([source]);
      store.set_missing_linked_sources([{ source, item_count: 3 }]);

      await service.delete_linked_source_data("source-1");

      expect(ls_port.clear_source).toHaveBeenCalledWith("test-vault", "Papers");
      expect(store.linked_sources).toHaveLength(0);
      expect(store.missing_linked_sources).toHaveLength(0);
      expect(vault_settings.set_vault_setting).toHaveBeenCalled();
    });
  });
});

describe("Phase C: ReferenceStore — missing linked sources", () => {
  it("set_missing_linked_sources populates state", () => {
    const store = new ReferenceStore();
    const source = make_source();
    store.set_missing_linked_sources([{ source, item_count: 10 }]);
    expect(store.missing_linked_sources).toHaveLength(1);
    expect(store.missing_linked_sources[0]!.item_count).toBe(10);
  });

  it("dismiss_missing_linked_source removes by id", () => {
    const store = new ReferenceStore();
    const s1 = make_source({ id: "s1", name: "A" });
    const s2 = make_source({ id: "s2", name: "B" });
    store.set_missing_linked_sources([
      { source: s1, item_count: 5 },
      { source: s2, item_count: 3 },
    ]);
    store.dismiss_missing_linked_source("s1");
    expect(store.missing_linked_sources).toHaveLength(1);
    expect(store.missing_linked_sources[0]!.source.id).toBe("s2");
  });

  it("reset clears missing_linked_sources", () => {
    const store = new ReferenceStore();
    store.set_missing_linked_sources([
      { source: make_source(), item_count: 1 },
    ]);
    store.reset();
    expect(store.missing_linked_sources).toHaveLength(0);
  });
});
