import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { ReferenceStoragePort } from "$lib/features/reference/ports";
import type { ReferenceSearchExtension } from "$lib/features/reference/ports";
import type { CslItem } from "$lib/features/reference/types";
import { make_item, make_mock_storage, make_vault_store } from "./helpers";

function make_mock_extension(items: CslItem[] = []): ReferenceSearchExtension {
  return {
    id: "test_ext",
    label: "Test Extension",
    test_connection: vi.fn(async () => true),
    search: vi.fn(async () => items),
    get_item: vi.fn(
      async (citekey: string) => items.find((i) => i.id === citekey) ?? null,
    ),
  };
}

describe("ReferenceService — Extension", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let ext: ReferenceSearchExtension;
  let service: ReferenceService;
  const now_ms = () => 1000;

  const ext_items = [make_item("smith2024"), make_item("jones2023")];

  beforeEach(() => {
    storage = make_mock_storage([make_item("existing")]);
    store = new ReferenceStore();
    op_store = new OpStore();
    ext = make_mock_extension(ext_items);
    service = new ReferenceService(
      storage,
      store,
      make_vault_store(),
      op_store,
      now_ms,
    );
    service.register_extension(ext);
  });

  describe("test_extension_connection", () => {
    it("sets connected when extension responds", async () => {
      const result = await service.test_extension_connection("test_ext");
      expect(result).toBe(true);
      expect(store.get_extension_status("test_ext")).toBe("connected");
      expect(store.error).toBeNull();
    });

    it("sets disconnected when extension is unreachable", async () => {
      (ext.test_connection as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
        false,
      );
      const result = await service.test_extension_connection("test_ext");
      expect(result).toBe(false);
      expect(store.get_extension_status("test_ext")).toBe("disconnected");
    });

    it("sets disconnected and error on exception", async () => {
      (ext.test_connection as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("network down"),
      );
      const result = await service.test_extension_connection("test_ext");
      expect(result).toBe(false);
      expect(store.get_extension_status("test_ext")).toBe("disconnected");
      expect(store.error).toBe("network down");
    });

    it("throws when extension is not registered", async () => {
      await expect(
        service.test_extension_connection("nonexistent"),
      ).rejects.toThrow('Extension "nonexistent" not registered');
    });
  });

  describe("search_extension", () => {
    it("searches and populates search_results", async () => {
      const results = await service.search_extension("test_ext", "smith");
      expect(ext.search).toHaveBeenCalledWith("smith");
      expect(results).toHaveLength(2);
      expect(store.search_results).toHaveLength(2);
    });

    it("assigns citekeys to items missing ids", async () => {
      (ext.search as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
        {
          id: "",
          type: "article-journal",
          title: "Test",
          author: [{ family: "Doe" }],
          issued: { "date-parts": [[2024]] },
        },
      ]);
      const results = await service.search_extension("test_ext", "doe");
      expect(results[0]!.id).toBeTruthy();
    });

    it("sets error on failure", async () => {
      (ext.search as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("timeout"),
      );
      const results = await service.search_extension("test_ext", "x");
      expect(results).toEqual([]);
      expect(store.error).toBe("timeout");
    });
  });

  describe("import_from_extension", () => {
    it("fetches items by citekey and merges into library", async () => {
      await service.import_from_extension("test_ext", ["smith2024"]);
      expect(ext.get_item).toHaveBeenCalledWith("smith2024");
      expect(storage.save_library).toHaveBeenCalled();
      expect(store.library_items).toHaveLength(2);
      expect(store.library_items.map((i) => i.id)).toContain("smith2024");
      expect(store.library_items.map((i) => i.id)).toContain("existing");
    });

    it("imports multiple items", async () => {
      await service.import_from_extension("test_ext", [
        "smith2024",
        "jones2023",
      ]);
      expect(ext.get_item).toHaveBeenCalledTimes(2);
      expect(store.library_items).toHaveLength(3);
    });

    it("skips items not found in extension", async () => {
      await service.import_from_extension("test_ext", ["nonexistent"]);
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
      );
      service.register_extension(ext);
      await service.import_from_extension("test_ext", ["smith2024"]);
      expect(store.library_items).toHaveLength(1);
    });

    it("sets error on failure", async () => {
      (ext.get_item as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("connection lost"),
      );
      await service.import_from_extension("test_ext", ["smith2024"]);
      expect(store.error).toBe("connection lost");
    });
  });
});
