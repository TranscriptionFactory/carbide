import { describe, expect, it, vi } from "vitest";
import {
  SearchService,
  looks_structured,
} from "$lib/features/search/application/search_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { SearchPort } from "$lib/features/search/ports";
import type { TagPort } from "$lib/features/tags/ports";
import type { BasesPort } from "$lib/features/bases/ports";
import { type VaultId, as_vault_id, as_note_path } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import type { HybridSearchHit } from "$lib/shared/types/search";
import type { NoteMeta } from "$lib/shared/types/note";

function make_note(path: string, title?: string): NoteMeta {
  return {
    id: as_note_path(path),
    path: as_note_path(path),
    name: path.split("/").at(-1)?.replace(".md", "") ?? "",
    title: title ?? path.split("/").at(-1)?.replace(".md", "") ?? "",
    blurb: "",
    mtime_ms: 0,
    ctime_ms: 0,
    size_bytes: 0,
    file_type: null,
  };
}

function make_mock_search_port(
  hybrid_results: HybridSearchHit[] = [],
): SearchPort {
  return {
    suggest_wiki_links: vi.fn().mockResolvedValue([]),
    suggest_planned_links: vi.fn().mockResolvedValue([]),
    search_notes: vi.fn().mockResolvedValue([]),
    get_note_links_snapshot: vi
      .fn()
      .mockResolvedValue({ backlinks: [], outlinks: [], orphan_links: [] }),
    extract_local_note_links: vi
      .fn()
      .mockResolvedValue({ outlink_paths: [], external_links: [] }),
    rewrite_note_links: vi
      .fn()
      .mockImplementation((markdown: string) =>
        Promise.resolve({ markdown, changed: false }),
      ),
    resolve_note_link: vi.fn().mockResolvedValue(null),
    resolve_wiki_link: vi.fn().mockResolvedValue(null),
    semantic_search: vi.fn().mockResolvedValue([]),
    hybrid_search: vi.fn().mockResolvedValue(hybrid_results),
    get_embedding_status: vi.fn().mockResolvedValue({
      total_notes: 0,
      embedded_notes: 0,
      model_version: "unavailable",
      is_embedding: false,
    }),
    find_similar_notes: vi.fn().mockResolvedValue([]),
    semantic_search_batch: vi.fn().mockResolvedValue([]),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    get_note_stats: vi.fn().mockResolvedValue({}),
    get_file_cache: vi.fn().mockResolvedValue({}),
    load_smart_link_rules: vi.fn().mockResolvedValue([]),
    save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
    compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
    compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
  };
}

function make_mock_index_port() {
  return {
    cancel_index: vi.fn().mockResolvedValue(undefined),
    sync_index: vi.fn().mockResolvedValue(undefined),
    sync_index_paths: vi.fn().mockResolvedValue(undefined),
    rebuild_index: vi.fn().mockResolvedValue(undefined),
    list_note_paths_by_prefix: vi.fn().mockResolvedValue([]),
    upsert_note: vi.fn().mockResolvedValue(undefined),
    remove_note: vi.fn().mockResolvedValue(undefined),
    remove_notes: vi.fn().mockResolvedValue(undefined),
    rename_note_path: vi.fn().mockResolvedValue(undefined),
    remove_notes_by_prefix: vi.fn().mockResolvedValue(undefined),
    rename_folder_paths: vi.fn().mockResolvedValue(undefined),
    subscribe_index_progress: vi.fn().mockReturnValue(() => {}),
    subscribe_vault_scan_stats: vi.fn().mockReturnValue(() => {}),
    subscribe_embedding_progress: vi.fn().mockReturnValue(() => {}),
    embed_sync: vi.fn().mockResolvedValue(undefined),
  };
}

function make_mock_tag_port(
  tags_to_notes: Record<string, string[]> = {},
): TagPort {
  return {
    list_all_tags: vi.fn().mockResolvedValue(
      Object.keys(tags_to_notes).map((t) => ({
        tag: t,
        count: tags_to_notes[t]!.length,
      })),
    ),
    get_notes_for_tag: vi
      .fn()
      .mockImplementation((_vid: string, tag: string) =>
        Promise.resolve(tags_to_notes[tag] ?? []),
      ),
    get_notes_for_tag_prefix: vi
      .fn()
      .mockImplementation((_vid: string, tag: string) =>
        Promise.resolve(tags_to_notes[tag] ?? []),
      ),
  };
}

function make_mock_bases_port(): BasesPort {
  return {
    list_properties: vi.fn().mockResolvedValue([]),
    query: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    save_view: vi.fn().mockResolvedValue(undefined),
    load_view: vi
      .fn()
      .mockResolvedValue({ columns: [], sort: [], filters: [] }),
    list_views: vi.fn().mockResolvedValue([]),
    delete_view: vi.fn().mockResolvedValue(undefined),
  };
}

function make_service_with_backends(
  search_port = make_mock_search_port(),
  tags_port = make_mock_tag_port(),
  bases_port = make_mock_bases_port(),
) {
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: "vault-1" as VaultId }));

  const service = new SearchService(
    search_port,
    vault_store,
    new OpStore(),
    () => 1,
    () => true,
    make_mock_index_port(),
    undefined,
    undefined,
    tags_port,
    bases_port,
  );

  return { service, search_port, tags_port, bases_port };
}

describe("looks_structured", () => {
  it("returns true for form prefixes", () => {
    expect(looks_structured("notes with #tag")).toBe(true);
    expect(looks_structured("note named foo")).toBe(true);
    expect(looks_structured("files in folder")).toBe(true);
    expect(looks_structured("folders named test")).toBe(true);
  });

  it("returns true for clause keywords", () => {
    expect(looks_structured("with #rust")).toBe(true);
    expect(looks_structured("named /regex/")).toBe(true);
    expect(looks_structured('in "Projects"')).toBe(true);
    expect(looks_structured("linked from foo")).toBe(true);
    expect(looks_structured("not with #tag")).toBe(true);
  });

  it("returns true for value syntax", () => {
    expect(looks_structured("#rust")).toBe(true);
    expect(looks_structured("/regex/")).toBe(true);
    expect(looks_structured("[[wikilink]]")).toBe(true);
  });

  it("returns false for plain text queries", () => {
    expect(looks_structured("hello world")).toBe(false);
    expect(looks_structured("react components")).toBe(false);
    expect(looks_structured("")).toBe(false);
  });

  it("returns false for command prefix", () => {
    expect(looks_structured("> theme")).toBe(false);
  });

  it("returns false for partial keywords without trailing space", () => {
    expect(looks_structured("notification")).toBe(false);
    expect(looks_structured("within")).toBe(false);
  });
});

describe("SearchService.search_omnibar structured queries", () => {
  it("routes structured query through query solver", async () => {
    const tag_notes = { rust: ["docs/rust.md"] };
    const tags_port = make_mock_tag_port(tag_notes);
    const search_port = make_mock_search_port();

    const { service } = make_service_with_backends(search_port, tags_port);

    const result = await service.search_omnibar("notes with #rust");

    expect(result.domain).toBe("notes");
    expect(tags_port.get_notes_for_tag_prefix).toHaveBeenCalled();
    expect(search_port.hybrid_search).not.toHaveBeenCalled();
  });

  it("falls back to hybrid for plain text queries", async () => {
    const hits: HybridSearchHit[] = [
      {
        note: make_note("docs/a.md"),
        score: 0.9,
        source: "both",
      },
    ];
    const { service, search_port } = make_service_with_backends(
      make_mock_search_port(hits),
    );

    const result = await service.search_omnibar("general query");

    expect(result.domain).toBe("notes");
    expect(result.items).toHaveLength(1);
    expect(search_port.hybrid_search).toHaveBeenCalled();
  });

  it("falls back to hybrid when structured parse fails", async () => {
    const hits: HybridSearchHit[] = [
      {
        note: make_note("docs/a.md"),
        score: 0.9,
        source: "both",
      },
    ];
    const { service, search_port } = make_service_with_backends(
      make_mock_search_port(hits),
    );

    const result = await service.search_omnibar("with");

    expect(result.domain).toBe("notes");
    expect(search_port.hybrid_search).toHaveBeenCalled();
  });

  it("falls back to hybrid when query solver throws", async () => {
    const tags_port = make_mock_tag_port();
    (
      tags_port.get_notes_for_tag_prefix as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error("tag lookup failed"));

    const hits: HybridSearchHit[] = [
      {
        note: make_note("docs/a.md"),
        score: 0.9,
        source: "both",
      },
    ];
    const { service, search_port } = make_service_with_backends(
      make_mock_search_port(hits),
      tags_port,
    );

    const result = await service.search_omnibar("notes with #broken");

    expect(result.domain).toBe("notes");
    expect(search_port.hybrid_search).toHaveBeenCalled();
  });

  it("routes commands normally regardless of structured syntax", async () => {
    const { service, search_port } = make_service_with_backends();

    const result = await service.search_omnibar("> theme");

    expect(result.domain).toBe("commands");
    expect(search_port.hybrid_search).not.toHaveBeenCalled();
  });
});
