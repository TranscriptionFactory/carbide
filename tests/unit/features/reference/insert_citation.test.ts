import { describe, it, expect, vi } from "vitest";
import { ReferenceService } from "$lib/features/reference/application/reference_service";
import { ReferenceStore } from "$lib/features/reference/state/reference_store.svelte";
import type { ZoteroPort } from "$lib/features/reference/ports";
import {
  sync_reference_to_markdown,
  extract_frontmatter,
} from "$lib/features/reference/domain/frontmatter_sync";
import { make_item, make_mock_storage, make_vault_store } from "./helpers";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";

function make_service(
  initial_items = [make_item("smith2024"), make_item("doe2023")],
  zotero_port: ZoteroPort | null = null,
) {
  const store = new ReferenceStore();
  const storage = make_mock_storage(initial_items);
  const op_store = new OpStore();
  const service = new ReferenceService(
    storage,
    store,
    make_vault_store(),
    op_store,
    () => Date.now(),
    null,
    null,
    zotero_port,
  );
  store.set_library_items(initial_items);
  return { service, store, storage };
}

describe("ReferenceService.find_in_library", () => {
  it("returns item when found", () => {
    const { service } = make_service();
    const result = service.find_in_library("smith2024");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("smith2024");
  });

  it("returns null when not found", () => {
    const { service } = make_service();
    expect(service.find_in_library("nonexistent")).toBeNull();
  });
});

describe("ReferenceService.ensure_in_library", () => {
  it("returns existing item without Zotero call", async () => {
    const zotero_port = {
      test_connection: vi.fn(),
      search_items: vi.fn(),
      get_item: vi.fn(),
      get_collections: vi.fn(),
      get_collection_items: vi.fn(),
      get_bibliography: vi.fn(),
    };
    const { service } = make_service(undefined, zotero_port);
    const result = await service.ensure_in_library("smith2024");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("smith2024");
    expect(zotero_port.get_item).not.toHaveBeenCalled();
  });

  it("fetches from Zotero when not in library", async () => {
    const remote_item = make_item("remote2024", { title: "Remote Paper" });
    const zotero_port = {
      test_connection: vi.fn(),
      search_items: vi.fn(),
      get_item: vi.fn(async () => remote_item),
      get_collections: vi.fn(),
      get_collection_items: vi.fn(),
      get_bibliography: vi.fn(),
    };
    const { service, store } = make_service([], zotero_port);
    const result = await service.ensure_in_library("remote2024");
    expect(result).not.toBeNull();
    expect(result!.title).toBe("Remote Paper");
    expect(zotero_port.get_item).toHaveBeenCalledWith("remote2024");
    expect(store.library_items.some((i) => i.id === "remote2024")).toBe(true);
  });

  it("returns null when Zotero not available", async () => {
    const { service } = make_service([]);
    const result = await service.ensure_in_library("missing");
    expect(result).toBeNull();
  });

  it("returns null when Zotero returns null", async () => {
    const zotero_port = {
      test_connection: vi.fn(),
      search_items: vi.fn(),
      get_item: vi.fn(async () => null),
      get_collections: vi.fn(),
      get_collection_items: vi.fn(),
      get_bibliography: vi.fn(),
    };
    const { service } = make_service([], zotero_port);
    const result = await service.ensure_in_library("missing");
    expect(result).toBeNull();
  });
});

describe("extract_frontmatter", () => {
  it("extracts YAML from markdown with frontmatter", () => {
    const md = "---\ntitle: Test\n---\n# Hello";
    const { yaml, body } = extract_frontmatter(md);
    expect(yaml).toBe("title: Test");
    expect(body).toBe("# Hello");
  });

  it("returns empty yaml for markdown without frontmatter", () => {
    const md = "# Hello\nWorld";
    const { yaml, body } = extract_frontmatter(md);
    expect(yaml).toBe("");
    expect(body).toBe("# Hello\nWorld");
  });

  it("handles empty markdown", () => {
    const { yaml, body } = extract_frontmatter("");
    expect(yaml).toBe("");
    expect(body).toBe("");
  });

  it("handles frontmatter-only markdown", () => {
    const md = "---\ntitle: Test\n---";
    const { yaml, body } = extract_frontmatter(md);
    expect(yaml).toBe("title: Test");
    expect(body).toBe("");
  });
});

describe("sync_reference_to_markdown", () => {
  it("adds frontmatter to markdown without frontmatter", () => {
    const md = "# Hello\nContent here";
    const item = make_item("smith2024", { title: "A Study" });
    const result = sync_reference_to_markdown(md, item);
    expect(result).toContain("---\n");
    expect(result).toContain("citekey: smith2024");
    expect(result).toContain("# Hello\nContent here");
  });

  it("adds reference to existing frontmatter", () => {
    const md = "---\ntitle: My Note\n---\n# Hello";
    const item = make_item("smith2024");
    const result = sync_reference_to_markdown(md, item);
    expect(result).toContain("title: My Note");
    expect(result).toContain("citekey: smith2024");
    expect(result).toContain("# Hello");
  });

  it("preserves body content exactly", () => {
    const md = "---\ntitle: Test\n---\n# Hello\n\nParagraph with `code`.\n";
    const item = make_item("doe2023");
    const result = sync_reference_to_markdown(md, item);
    expect(result).toContain("# Hello\n\nParagraph with `code`.\n");
  });
});
