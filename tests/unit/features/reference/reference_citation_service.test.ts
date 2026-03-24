import { describe, it, expect, vi, beforeEach } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type {
  ReferenceStoragePort,
  CitationPort,
  DoiLookupPort,
} from "$lib/features/reference/ports";
import type { CslItem, ReferenceLibrary } from "$lib/features/reference/types";

function make_item(id: string, overrides?: Partial<CslItem>): CslItem {
  return {
    id,
    type: "article-journal",
    title: `Title for ${id}`,
    author: [{ family: id }],
    issued: { "date-parts": [[2024]] },
    ...overrides,
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
      if (idx >= 0) items[idx] = item;
      else items.push(item);
      return make_library(items);
    }),
    remove_item: vi.fn(async (_vault_id, citekey) => {
      items = items.filter((i) => i.id !== citekey);
      return make_library(items);
    }),
  };
}

function make_mock_citation_port(): CitationPort {
  return {
    parse_bibtex: vi.fn(async (bibtex: string) => {
      if (bibtex.includes("@article")) {
        return [make_item("smith2024"), make_item("jones2023")];
      }
      return [];
    }),
    parse_ris: vi.fn(async (ris: string) => {
      if (ris.includes("TY  -")) {
        return [make_item("doe2022")];
      }
      return [];
    }),
    render_citation: vi.fn(async () => "(Smith, 2024)"),
    render_bibliography: vi.fn(
      async () => "Smith, J. (2024). Title for smith2024.",
    ),
    list_styles: vi.fn(() => ["apa", "vancouver", "harvard1"]),
  };
}

function make_mock_doi_port(): DoiLookupPort {
  return {
    lookup_doi: vi.fn(async (doi: string) => {
      if (doi === "10.1234/test") {
        return make_item("found2024", { DOI: doi, title: "Found Article" });
      }
      return null;
    }),
  };
}

function make_vault_store() {
  return { vault: { id: "test-vault", path: "/tmp/test" } } as never;
}

describe("ReferenceService — Citation.js integration", () => {
  let storage: ReferenceStoragePort;
  let store: ReferenceStore;
  let op_store: OpStore;
  let citation_port: CitationPort;
  let doi_port: DoiLookupPort;
  let service: ReferenceService;
  const now_ms = () => 1000;

  beforeEach(() => {
    storage = make_mock_storage();
    store = new ReferenceStore();
    op_store = new OpStore();
    citation_port = make_mock_citation_port();
    doi_port = make_mock_doi_port();
    service = new ReferenceService(
      storage,
      store,
      make_vault_store(),
      op_store,
      now_ms,
      citation_port,
      doi_port,
    );
  });

  describe("import_bibtex", () => {
    it("parses bibtex and adds all items to library in single batch", async () => {
      const result = await service.import_bibtex("@article{smith2024, ...}");
      expect(result).toHaveLength(2);
      expect(citation_port.parse_bibtex).toHaveBeenCalledWith(
        "@article{smith2024, ...}",
      );
      expect(store.library_items).toHaveLength(2);
      expect(store.error).toBeNull();
      expect(storage.save_library).toHaveBeenCalledTimes(1);
    });

    it("sets error on parse failure", async () => {
      (
        citation_port.parse_bibtex as ReturnType<typeof vi.fn>
      ).mockRejectedValueOnce(new Error("invalid bibtex"));
      const result = await service.import_bibtex("garbage");
      expect(result).toEqual([]);
      expect(store.error).toBe("invalid bibtex");
    });
  });

  describe("import_ris", () => {
    it("parses RIS and adds items to library", async () => {
      const result = await service.import_ris("TY  - JOUR\n...");
      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe("doe2022");
      expect(store.library_items).toHaveLength(1);
    });
  });

  describe("lookup_doi", () => {
    it("resolves a valid DOI to a CslItem", async () => {
      const result = await service.lookup_doi("10.1234/test");
      expect(result).toBeDefined();
      expect(result?.DOI).toBe("10.1234/test");
      expect(store.search_results).toHaveLength(1);
    });

    it("returns null for unknown DOI", async () => {
      const result = await service.lookup_doi("10.9999/unknown");
      expect(result).toBeNull();
      expect(store.search_results).toEqual([]);
    });

    it("sets error on failure", async () => {
      (doi_port.lookup_doi as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
        new Error("network error"),
      );
      const result = await service.lookup_doi("10.1234/test");
      expect(result).toBeNull();
      expect(store.error).toBe("network error");
    });
  });

  describe("render_bibliography", () => {
    it("renders bibliography for selected citekeys", async () => {
      store.set_library_items([make_item("smith2024")]);
      const result = await service.render_bibliography(["smith2024"], "apa");
      expect(citation_port.render_bibliography).toHaveBeenCalled();
      expect(result).toContain("Smith");
    });

    it("returns empty string when no matching items", async () => {
      const result = await service.render_bibliography(["nonexistent"], "apa");
      expect(result).toBe("");
    });
  });

  describe("list_citation_styles", () => {
    it("returns available styles", () => {
      const styles = service.list_citation_styles();
      expect(styles).toContain("apa");
      expect(styles).toContain("vancouver");
    });
  });

  describe("without citation port", () => {
    it("throws when trying to import bibtex", async () => {
      const no_citation_service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
      );
      const result = await no_citation_service.import_bibtex("@article{...}");
      expect(result).toEqual([]);
      expect(store.error).toBe("Citation port not available");
    });

    it("returns empty styles list", () => {
      const no_citation_service = new ReferenceService(
        storage,
        store,
        make_vault_store(),
        op_store,
        now_ms,
        null,
        null,
      );
      expect(no_citation_service.list_citation_styles()).toEqual([]);
    });
  });
});
