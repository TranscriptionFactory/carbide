import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  ReferenceStoragePort,
  ZoteroPort,
} from "$lib/features/reference/ports";
import type { PdfAnnotation } from "$lib/features/reference/types";
import {
  make_annotation,
  make_item,
  make_mock_storage,
  make_vault_store,
} from "./helpers";

function make_mock_zotero(annotations: PdfAnnotation[] = []): ZoteroPort {
  return {
    test_connection: vi.fn(async () => true),
    search_items: vi.fn(async () => []),
    get_item: vi.fn(async () => null),
    get_collections: vi.fn(async () => []),
    get_collection_items: vi.fn(async () => []),
    get_bibliography: vi.fn(async () => ""),
    get_item_annotations: vi.fn(async () => annotations),
  };
}

describe("ReferenceService — Annotations", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let zotero: ZoteroPort;
  let service: ReferenceService;
  const now_ms = () => 1000;

  const sample_annotations: PdfAnnotation[] = [
    make_annotation({ page: 1, text: "first highlight" }),
    make_annotation({ page: 2, text: "second highlight" }),
    make_annotation({
      page: 2,
      text: "a note",
      type: "note",
      comment: "important",
    }),
  ];

  beforeEach(() => {
    storage = make_mock_storage([make_item("smith2024")]);
    store = new ReferenceStore();
    op_store = new OpStore();
    zotero = make_mock_zotero(sample_annotations);
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

  describe("sync_annotations", () => {
    it("fetches annotations from Zotero and saves markdown", async () => {
      const result = await service.sync_annotations("smith2024");
      expect(zotero.get_item_annotations).toHaveBeenCalledWith("smith2024");
      expect(result).toHaveLength(3);
      expect(storage.save_annotation_note).toHaveBeenCalledWith(
        "test-vault",
        "smith2024",
        expect.stringContaining("# Annotations: smith2024"),
      );
    });

    it("populates store annotations", async () => {
      await service.sync_annotations("smith2024");
      expect(store.get_annotations("smith2024")).toHaveLength(3);
      expect(store.get_annotations("smith2024")[0]!.text).toBe(
        "first highlight",
      );
    });

    it("clears error on success", async () => {
      store.set_error("previous error");
      await service.sync_annotations("smith2024");
      expect(store.error).toBeNull();
    });

    it("handles empty annotations", async () => {
      zotero = make_mock_zotero([]);
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
      const result = await service.sync_annotations("smith2024");
      expect(result).toHaveLength(0);
      expect(storage.save_annotation_note).toHaveBeenCalled();
    });

    it("sets error on Zotero failure", async () => {
      (
        zotero.get_item_annotations as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("BBT unreachable"));
      const result = await service.sync_annotations("smith2024");
      expect(result).toEqual([]);
      expect(store.error).toBe("BBT unreachable");
    });

    it("throws when zotero port is null", async () => {
      const no_zotero = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
      );
      await expect(no_zotero.sync_annotations("x")).rejects.toThrow(
        "Zotero port not available",
      );
    });

    it("saved markdown contains page sections", async () => {
      await service.sync_annotations("smith2024");
      const saved_md = (
        storage.save_annotation_note as ReturnType<typeof vi.fn>
      ).mock.calls[0]![2] as string;
      expect(saved_md).toContain("## Page 1");
      expect(saved_md).toContain("## Page 2");
      expect(saved_md).toContain("> first highlight");
      expect(saved_md).toContain("> second highlight");
    });
  });
});
