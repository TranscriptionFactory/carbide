import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  ReferenceStoragePort,
  ZoteroPort,
} from "$lib/features/reference/ports";
import type { CslItem, ReferenceLibrary } from "$lib/features/reference/types";

function make_item(id: string): CslItem {
  return {
    id,
    type: "article-journal",
    title: `Title for ${id}`,
    author: [{ family: id }],
  };
}

function make_library(items: CslItem[]): ReferenceLibrary {
  return { schema_version: 1, items };
}

function make_mock_storage(
  initial_items: CslItem[] = [],
): ReferenceStoragePort {
  let items = [...initial_items];
  return {
    load_library: vi.fn(async () => make_library(items)),
    save_library: vi.fn(async (_vault_id, library) => {
      items = library.items;
    }),
    add_item: vi.fn(async (_vault_id, item) => {
      const idx = items.findIndex((i) => i.id === item.id);
      if (idx >= 0) {
        items[idx] = item;
      } else {
        items.push(item);
      }
      return make_library(items);
    }),
    remove_item: vi.fn(async (_vault_id, citekey) => {
      items = items.filter((i) => i.id !== citekey);
      return make_library(items);
    }),
  };
}

function make_vault_store() {
  return { vault: { id: "test-vault", path: "/tmp/test" } } as never;
}

function make_mock_zotero(items: CslItem[] = []): ZoteroPort {
  return {
    test_connection: vi.fn(async () => true),
    search_items: vi.fn(async () => items),
    get_item: vi.fn(
      async (citekey: string) => items.find((i) => i.id === citekey) ?? null,
    ),
    get_collections: vi.fn(async () => []),
    get_collection_items: vi.fn(async () => []),
    get_bibliography: vi.fn(async () => "<bib>"),
  };
}

describe("ReferenceService — Zotero", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let zotero: ZoteroPort;
  let service: ReferenceService;
  const now_ms = () => 1000;

  const zotero_items = [make_item("smith2024"), make_item("jones2023")];

  beforeEach(() => {
    storage = make_mock_storage([make_item("existing")]);
    store = new ReferenceStore();
    op_store = new OpStore();
    zotero = make_mock_zotero(zotero_items);
    service = new ReferenceService(
      storage,
      store,
      make_vault_store(),
      op_store,
      now_ms,
      null,
      null,
      zotero,
    );
  });

  describe("test_zotero_connection", () => {
    it("sets connected when BBT responds", async () => {
      const result = await service.test_zotero_connection();
      expect(result).toBe(true);
      expect(store.connection_status).toBe("connected");
      expect(store.error).toBeNull();
    });

    it("sets disconnected when BBT is unreachable", async () => {
      (
        zotero.test_connection as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce(false);
      const result = await service.test_zotero_connection();
      expect(result).toBe(false);
      expect(store.connection_status).toBe("disconnected");
    });

    it("sets disconnected and error on exception", async () => {
      (
        zotero.test_connection as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("network down"));
      const result = await service.test_zotero_connection();
      expect(result).toBe(false);
      expect(store.connection_status).toBe("disconnected");
      expect(store.error).toBe("network down");
    });

    it("throws when zotero port is null", async () => {
      const no_zotero_service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
      );
      await expect(no_zotero_service.test_zotero_connection()).rejects.toThrow(
        "Zotero port not available",
      );
    });
  });

  describe("search_zotero", () => {
    it("searches and populates search_results", async () => {
      const results = await service.search_zotero("smith");
      expect(zotero.search_items).toHaveBeenCalledWith("smith");
      expect(results).toHaveLength(2);
      expect(store.search_results).toHaveLength(2);
    });

    it("assigns citekeys to items missing ids", async () => {
      (zotero.search_items as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "",
          type: "article-journal",
          title: "Test",
          author: [{ family: "Doe" }],
          issued: { "date-parts": [[2024]] },
        },
      ]);
      const results = await service.search_zotero("doe");
      expect(results[0]!.id).toBeTruthy();
    });

    it("sets error on failure", async () => {
      (zotero.search_items as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("timeout"),
      );
      const results = await service.search_zotero("x");
      expect(results).toEqual([]);
      expect(store.error).toBe("timeout");
    });
  });

  describe("import_from_zotero", () => {
    it("fetches items by citekey and merges into library", async () => {
      await service.import_from_zotero(["smith2024"]);
      expect(zotero.get_item).toHaveBeenCalledWith("smith2024");
      expect(storage.save_library).toHaveBeenCalled();
      expect(store.library_items).toHaveLength(2);
      expect(store.library_items.map((i) => i.id)).toContain("smith2024");
      expect(store.library_items.map((i) => i.id)).toContain("existing");
    });

    it("imports multiple items", async () => {
      await service.import_from_zotero(["smith2024", "jones2023"]);
      expect(zotero.get_item).toHaveBeenCalledTimes(2);
      expect(store.library_items).toHaveLength(3);
    });

    it("skips items not found in Zotero", async () => {
      await service.import_from_zotero(["nonexistent"]);
      expect(store.library_items).toHaveLength(1);
    });

    it("deduplicates on import (updates existing)", async () => {
      storage = make_mock_storage([make_item("smith2024")]);
      service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
        zotero,
      );
      await service.import_from_zotero(["smith2024"]);
      expect(store.library_items).toHaveLength(1);
    });

    it("sets error on failure", async () => {
      (zotero.get_item as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("connection lost"),
      );
      await service.import_from_zotero(["smith2024"]);
      expect(store.error).toBe("connection lost");
    });
  });
});
