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
    search_blocks: vi.fn().mockResolvedValue([]),
    get_embedding_status: vi.fn().mockResolvedValue({
      total_notes: 0,
      embedded_notes: 0,
      eligible_notes: 0,
      embedded_eligible_notes: 0,
      skipped_notes: 0,
      embed_attempt_completed: false,
      embedding_enabled: true,
      model_version: "unavailable",
      is_embedding: false,
    }),
    find_similar_notes: vi.fn().mockResolvedValue([]),
    find_missing_links: vi.fn().mockResolvedValue([]),
    semantic_search_batch: vi.fn().mockResolvedValue([]),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    get_note_stats: vi.fn().mockResolvedValue({}),
    get_indexed_body: vi.fn().mockResolvedValue(null),
    get_file_cache: vi.fn().mockResolvedValue({}),
    search_headings: vi.fn().mockResolvedValue([]),
    query_sections: vi.fn().mockResolvedValue([]),
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
    find_notes_by_name: vi.fn().mockResolvedValue([]),
    upsert_note: vi.fn().mockResolvedValue(undefined),
    remove_note: vi.fn().mockResolvedValue(undefined),
    remove_notes: vi.fn().mockResolvedValue(undefined),
    rename_note_path: vi.fn().mockResolvedValue(undefined),
    remove_notes_by_prefix: vi.fn().mockResolvedValue(undefined),
    rename_folder_paths: vi.fn().mockResolvedValue(undefined),
    subscribe_index_progress: vi.fn().mockReturnValue(() => {}),
    subscribe_vault_scan_stats: vi.fn().mockReturnValue(() => {}),
    subscribe_embedding_progress: vi.fn().mockReturnValue(() => {}),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
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
    count_many: vi.fn().mockResolvedValue([]),
    save_view: vi.fn().mockResolvedValue(undefined),
    load_view: vi
      .fn()
      .mockResolvedValue({ columns: [], sort: [], filters: [] }),
    list_views: vi.fn().mockResolvedValue([]),
    delete_view: vi.fn().mockResolvedValue(undefined),
    update_property: vi.fn().mockResolvedValue(undefined),
    seed_default_views: vi.fn().mockResolvedValue(0),
  };
}

function make_service_with_backends(
  search_port = make_mock_search_port(),
  tags_port = make_mock_tag_port(),
  bases_port = make_mock_bases_port(),
  index_port = make_mock_index_port(),
) {
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault({ id: "vault-1" as VaultId }));

  const service = new SearchService(
    search_port,
    vault_store,
    new OpStore(),
    () => 1,
    () => true,
    index_port,
    undefined,
    undefined,
    tags_port,
    bases_port,
  );

  return { service, search_port, tags_port, bases_port, index_port };
}

describe("looks_structured", () => {
  it("returns true for form prefixes", () => {
    expect(looks_structured("notes with #tag")).toBe(true);
    expect(looks_structured("note named foo")).toBe(true);
    expect(looks_structured("sections named Meeting")).toBe(true);
    expect(looks_structured("section under Roadmap")).toBe(true);
  });

  it("returns false for prefixes the parser rejects", () => {
    expect(looks_structured("files in folder")).toBe(false);
    expect(looks_structured("folders named test")).toBe(false);
  });

  it("returns true for clauses carrying value syntax or linked-from", () => {
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
    expect(looks_structured("with due_date = 2024")).toBe(true);
  });

  it("returns false for plain text queries", () => {
    expect(looks_structured("hello world")).toBe(false);
    expect(looks_structured("react components")).toBe(false);
    expect(looks_structured("")).toBe(false);
  });

  it("returns false for bare keywords at the start of a query", () => {
    expect(looks_structured("in progress")).toBe(false);
    expect(looks_structured("with images")).toBe(false);
    expect(looks_structured("named entities")).toBe(false);
    expect(looks_structured("not today")).toBe(false);
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

  it("returns note rows for a sections query", async () => {
    const search_port = make_mock_search_port();
    vi.mocked(search_port.query_sections).mockResolvedValue([
      {
        note: make_note("Projects/roadmap.md"),
        heading_id: "h-2-q4-0",
        title: "Q4",
        level: 2,
        heading_path: "Roadmap/Q4",
        start_line: 8,
        end_line: 20,
        word_count: 30,
      },
    ]);
    const { service } = make_service_with_backends(search_port);

    const result = await service.search_omnibar('sections named "Q4"');

    expect(result.domain).toBe("notes");
    expect(
      result.items.map((item) => item.kind === "note" && item.note.path),
    ).toEqual(["Projects/roadmap.md"]);
    expect(search_port.hybrid_search).not.toHaveBeenCalled();
  });

  it("drops linked sources from structured results when the setting is off", async () => {
    const tags_port = make_mock_tag_port({
      rust: ["docs/rust.md", "@linked/zotero/paper.pdf"],
    });

    const { service } = make_service_with_backends(
      make_mock_search_port(),
      tags_port,
    );

    const included = await service.search_omnibar("notes with #rust", true);
    expect(included.items).toHaveLength(2);

    const excluded = await service.search_omnibar(
      "notes with #rust",
      true,
      false,
    );
    expect(excluded.items).toHaveLength(1);
    expect(
      excluded.items.every(
        (item) =>
          item.kind === "note" && !item.note.path.startsWith("@linked/"),
      ),
    ).toBe(true);
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

    const result = await service.search_omnibar("status = open");

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

describe("SearchService.search_omnibar folder scope", () => {
  function folder_index_port(paths_by_prefix: Record<string, string[]>) {
    const index_port = make_mock_index_port();
    index_port.list_note_paths_by_prefix = vi
      .fn()
      .mockImplementation((_vault_id: string, prefix: string) =>
        Promise.resolve(paths_by_prefix[prefix] ?? []),
      );
    return index_port;
  }

  function note_paths(items: { kind: string; note?: NoteMeta }[]): string[] {
    return items
      .filter(
        (item): item is { kind: "note"; note: NoteMeta } =>
          item.kind === "note",
      )
      .map((item) => String(item.note.path));
  }

  it("filters hybrid hits to the folder and descendants", async () => {
    const hits: HybridSearchHit[] = [
      { note: make_note("Projects/a.md"), score: 0.9, source: "both" },
      { note: make_note("Projects/sub/b.md"), score: 0.8, source: "fts" },
      { note: make_note("Other/c.md"), score: 0.7, source: "fts" },
    ];
    const index_port = folder_index_port({
      "Projects/": ["Projects/a.md", "Projects/sub/b.md"],
    });
    const { service } = make_service_with_backends(
      make_mock_search_port(hits),
      undefined,
      undefined,
      index_port,
    );

    const result = await service.search_omnibar(
      "query",
      true,
      true,
      "Projects",
    );

    expect(note_paths(result.items)).toEqual([
      "Projects/a.md",
      "Projects/sub/b.md",
    ]);
  });

  it("filters structured solve_query results to the folder", async () => {
    const tags_port = make_mock_tag_port({
      rust: ["Projects/a.md", "Other/b.md"],
    });
    const index_port = folder_index_port({
      "Projects/": ["Projects/a.md"],
    });
    const { service } = make_service_with_backends(
      make_mock_search_port(),
      tags_port,
      undefined,
      index_port,
    );

    const result = await service.search_omnibar(
      "notes with #rust",
      true,
      true,
      "Projects",
    );

    expect(note_paths(result.items)).toEqual(["Projects/a.md"]);
  });

  it("leaves results unfiltered when no folder scope is set", async () => {
    const hits: HybridSearchHit[] = [
      { note: make_note("Projects/a.md"), score: 0.9, source: "both" },
      { note: make_note("Other/c.md"), score: 0.7, source: "fts" },
    ];
    const { service } = make_service_with_backends(make_mock_search_port(hits));

    const result = await service.search_omnibar("query");

    expect(note_paths(result.items)).toEqual(["Projects/a.md", "Other/c.md"]);
  });

  it("filter_hits_to_folder queries the folder prefix with a trailing slash", async () => {
    const hits: HybridSearchHit[] = [
      { note: make_note("Projects/a.md"), score: 1, source: "fts" },
      { note: make_note("Outside/c.md"), score: 1, source: "fts" },
    ];
    const index_port = folder_index_port({
      "Projects/": ["Projects/a.md"],
    });
    const { service } = make_service_with_backends(
      make_mock_search_port(),
      undefined,
      undefined,
      index_port,
    );

    const filtered = await service.filter_hits_to_folder(
      hits,
      "vault-1" as VaultId,
      "Projects",
    );

    expect(index_port.list_note_paths_by_prefix).toHaveBeenCalledWith(
      "vault-1",
      "Projects/",
    );
    expect(filtered.map((hit) => String(hit.note.path))).toEqual([
      "Projects/a.md",
    ]);
  });
});
