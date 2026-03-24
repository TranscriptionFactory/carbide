import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { ReferenceStoragePort } from "$lib/features/reference/ports";
import { make_item, make_mock_storage, make_vault_store } from "./helpers";

describe("ReferenceService", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let service: ReferenceService;
  const now_ms = () => 1000;

  beforeEach(() => {
    storage = make_mock_storage([make_item("a"), make_item("b")]);
    store = new ReferenceStore();
    op_store = new OpStore();
    service = new ReferenceService(
      storage,
      store,
      make_vault_store(),
      op_store,
      now_ms,
    );
  });

  describe("load_library", () => {
    it("loads items into store", async () => {
      await service.load_library();
      expect(store.library_items).toHaveLength(2);
      expect(store.library_items[0]!.id).toBe("a");
      expect(store.loading).toBe(false);
      expect(store.error).toBeNull();
    });

    it("sets error on failure", async () => {
      (storage.load_library as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("disk error"),
      );
      await service.load_library();
      expect(store.error).toBe("disk error");
      expect(store.loading).toBe(false);
    });
  });

  describe("add_reference", () => {
    it("adds item and updates store", async () => {
      const new_item = make_item("c");
      await service.add_reference(new_item, "manual");
      expect(storage.add_item).toHaveBeenCalledWith("test-vault", new_item);
      expect(store.library_items).toHaveLength(3);
    });

    it("updates existing item (dedup by citekey)", async () => {
      const updated = { ...make_item("a"), title: "Updated" };
      await service.add_reference(updated, "manual");
      expect(store.library_items).toHaveLength(2);
      const found = store.library_items.find((i) => i.id === "a");
      expect(found?.title).toBe("Updated");
    });

    it("sets error on failure", async () => {
      (storage.add_item as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("write error"),
      );
      await service.add_reference(make_item("x"), "manual");
      expect(store.error).toBe("write error");
    });
  });

  describe("remove_reference", () => {
    it("removes item and updates store", async () => {
      await service.load_library();
      await service.remove_reference("a");
      expect(store.library_items).toHaveLength(1);
      expect(store.library_items[0]!.id).toBe("b");
    });
  });

  describe("search_library", () => {
    it("filters items by query", async () => {
      await service.load_library();
      const results = service.search_library("a");
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(store.search_results.length).toBeGreaterThanOrEqual(1);
    });

    it("clears results for empty query", () => {
      service.search_library("");
      expect(store.search_results).toEqual([]);
    });

    it("returns empty for non-matching query", async () => {
      await service.load_library();
      const results = service.search_library("zzzzz");
      expect(results).toEqual([]);
    });
  });
});
