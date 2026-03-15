import { describe, expect, it, vi } from "vitest";
import { SearchService } from "$lib/features/search/application/search_service";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import {
  as_note_path,
  as_vault_id,
  as_vault_path,
} from "$lib/shared/types/ids";
import type {
  HybridSearchHit,
  NoteSearchHit,
  PlannedLinkSuggestion,
  WikiSuggestion,
} from "$lib/shared/types/search";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_mock_index_port } from "../helpers/mock_ports";

function create_deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (error?: unknown) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function existing(path: string, score = 1): WikiSuggestion {
  return {
    kind: "existing",
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.split("/").at(-1)?.replace(".md", "") ?? "",
      title: path.split("/").at(-1)?.replace(".md", "") ?? "",
      mtime_ms: 0,
      size_bytes: 0,
    },
    score,
  };
}

function planned(
  target_path: string,
  ref_count: number,
): PlannedLinkSuggestion {
  return { target_path, ref_count };
}

describe("SearchService", () => {
  it("searches notes and returns results", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 1,
          snippet: "match",
        },
      ]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
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
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const op_store = new OpStore();

    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const result = await service.search_notes("alpha");

    expect(search_port.search_notes).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.results.length).toBe(1);
    }
    expect(op_store.get("search.notes").status).toBe("success");
  });

  it("returns empty result and resets op for empty query", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
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
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    const op_store = new OpStore();

    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    op_store.start("search.notes", 123);
    const result = await service.search_notes("  ");

    expect(result).toEqual({
      status: "empty",
      results: [],
    });
    expect(search_port.search_notes).not.toHaveBeenCalled();
    expect(op_store.get("search.notes").status).toBe("idle");
  });

  it("finds the editor width setting in settings search", () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
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
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    const results = service.search_settings("width");

    expect(
      results.some(
        (result) =>
          result.kind === "setting" &&
          result.setting.key === "editor_max_width_ch",
      ),
    ).toBe(true);
  });

  it("filters disabled commands from command search", () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
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
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
      (command) => command.id !== "ai_assistant",
    );

    const results = service.search_commands("ai");

    expect(
      results.some(
        (result) =>
          result.kind === "command" && result.command.id === "ai_assistant",
      ),
    ).toBe(false);
  });

  it("returns stale for out-of-order wiki suggest responses", async () => {
    const first = create_deferred<WikiSuggestion[]>();
    const second = create_deferred<WikiSuggestion[]>();
    let call = 0;

    const search_port = {
      suggest_wiki_links: vi.fn().mockImplementation(() => {
        call += 1;
        return call === 1 ? first.promise : second.promise;
      }),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
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
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());
    const op_store = new OpStore();
    const service = new SearchService(
      search_port,
      vault_store,
      op_store,
      () => 1,
    );

    const first_call = service.suggest_wiki_links("alpha");
    const second_call = service.suggest_wiki_links("alpha beta");

    second.resolve([existing("docs/b.md")]);
    first.resolve([existing("docs/a.md")]);

    await expect(first_call).resolves.toEqual({
      status: "stale",
      results: [],
    });
    await expect(second_call).resolves.toEqual({
      status: "success",
      results: [existing("docs/b.md")],
    });
  });

  it("merges planned suggestions without duplicating existing paths", async () => {
    const search_port = {
      suggest_wiki_links: vi
        .fn()
        .mockResolvedValue([
          existing("docs/a.md", 8),
          existing("docs/b.md", 6),
        ]),
      suggest_planned_links: vi
        .fn()
        .mockResolvedValue([planned("docs/b.md", 12), planned("docs/c.md", 9)]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
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
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    vault_store.set_vault(
      create_test_vault({
        id: as_vault_id("vault-a"),
        path: as_vault_path("/vault/a"),
      }),
    );

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );

    const result = await service.suggest_wiki_links("doc");

    expect(result.status).toBe("success");
    if (result.status !== "success") {
      throw new Error("expected success");
    }

    expect(result.results).toEqual([
      existing("docs/a.md", 8),
      existing("docs/b.md", 6),
      {
        kind: "planned",
        target_path: "docs/c.md",
        ref_count: 9,
        score: 9,
      },
    ]);
  });

  it("delegates wiki-link resolution to the search port", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue("docs/wiki.md"),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    const resolved = await service.resolve_wiki_link("source.md", "docs/wiki");

    expect(resolved).toBe("docs/wiki.md");
    expect(search_port.resolve_wiki_link).toHaveBeenCalledWith(
      "source.md",
      "docs/wiki",
    );
  });

  it("prefers exact indexed root matches for markdown links before creating relative targets", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi
        .fn()
        .mockResolvedValue("docs/exposomics/overview.md"),
      resolve_wiki_link: vi.fn().mockResolvedValue(null),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    const vault = create_test_vault({
      id: as_vault_id("vault-link-resolution"),
      path: as_vault_path("/vault/link-resolution"),
    });
    vault_store.set_vault(vault);

    const index_port = create_mock_index_port();
    index_port._mock_note_paths_by_prefix.set(
      `${String(vault.id)}::exposomics/overview.md`,
      ["exposomics/overview.md"],
    );

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
      () => true,
      index_port,
    );

    const resolved = await service.resolve_note_link(
      "docs/current.md",
      "exposomics/overview.md",
    );

    expect(resolved).toBe("exposomics/overview.md");
  });

  it("resolves bare wiki links to indexed folder notes when present", async () => {
    const search_port = {
      suggest_wiki_links: vi.fn().mockResolvedValue([]),
      suggest_planned_links: vi.fn().mockResolvedValue([]),
      search_notes: vi.fn().mockResolvedValue([]),
      get_note_links_snapshot: vi.fn().mockResolvedValue({
        backlinks: [],
        outlinks: [],
        orphan_links: [],
      }),
      extract_local_note_links: vi
        .fn()
        .mockResolvedValue({ outlink_paths: [], external_links: [] }),
      rewrite_note_links: vi
        .fn()
        .mockImplementation((markdown: string) =>
          Promise.resolve({ markdown, changed: false }),
        ),
      resolve_note_link: vi.fn().mockResolvedValue(null),
      resolve_wiki_link: vi.fn().mockResolvedValue("exposomics.md"),
      semantic_search: vi.fn().mockResolvedValue([]),
      hybrid_search: vi.fn().mockResolvedValue([]),
      get_embedding_status: vi.fn().mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "unavailable",
        is_embedding: false,
      }),
      find_similar_notes: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    };

    const vault_store = new VaultStore();
    const vault = create_test_vault({
      id: as_vault_id("vault-folder-note"),
      path: as_vault_path("/vault/folder-note"),
    });
    vault_store.set_vault(vault);

    const index_port = create_mock_index_port();
    index_port._mock_note_paths_by_prefix.set(
      `${String(vault.id)}::exposomics.md`,
      [],
    );
    index_port._mock_note_paths_by_prefix.set(
      `${String(vault.id)}::exposomics/exposomics.md`,
      ["exposomics/exposomics.md"],
    );

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
      () => true,
      index_port,
    );

    const resolved = await service.resolve_wiki_link(
      "notes/current.md",
      "exposomics",
    );

    expect(resolved).toBe("exposomics/exposomics.md");
  });

  describe("search_omnibar hybrid fallback", () => {
    function make_note_hit(path: string, score = 1): HybridSearchHit {
      return {
        note: {
          id: as_note_path(path),
          path: as_note_path(path),
          name: path.split("/").at(-1)?.replace(".md", "") ?? "",
          title: path.split("/").at(-1)?.replace(".md", "") ?? "",
          mtime_ms: 0,
          size_bytes: 0,
        },
        score,
        source: "vector",
      };
    }

    function make_search_port(overrides: {
      search_notes_results?: NoteSearchHit[];
      hybrid_search_results?: HybridSearchHit[];
    }) {
      return {
        suggest_wiki_links: vi.fn().mockResolvedValue([]),
        suggest_planned_links: vi.fn().mockResolvedValue([]),
        search_notes: vi
          .fn()
          .mockResolvedValue(overrides.search_notes_results ?? []),
        get_note_links_snapshot: vi.fn().mockResolvedValue({
          backlinks: [],
          outlinks: [],
          orphan_links: [],
        }),
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
        hybrid_search: vi
          .fn()
          .mockResolvedValue(overrides.hybrid_search_results ?? []),
        get_embedding_status: vi.fn().mockResolvedValue({
          total_notes: 0,
          embedded_notes: 0,
          model_version: "unavailable",
          is_embedding: false,
        }),
        find_similar_notes: vi.fn().mockResolvedValue([]),
        rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      };
    }

    it("triggers hybrid fallback when FTS returns fewer than 3 results for a 3+ word query", async () => {
      const hybrid_hit = make_note_hit("docs/semantic.md", 0.9);
      const search_port = make_search_port({
        search_notes_results: [],
        hybrid_search_results: [hybrid_hit],
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      const result = await service.search_omnibar("how to write notes");

      expect(search_port.hybrid_search).toHaveBeenCalledTimes(1);
      expect(result.domain).toBe("notes");
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        kind: "note",
        source: "vector",
      });
    });

    it("does not trigger hybrid fallback for short queries under 3 words", async () => {
      const search_port = make_search_port({
        search_notes_results: [],
        hybrid_search_results: [make_note_hit("docs/semantic.md")],
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      await service.search_omnibar("two words");

      expect(search_port.hybrid_search).not.toHaveBeenCalled();
    });

    it("does not trigger hybrid fallback when FTS returns 3 or more results", async () => {
      const fts_results = ["a.md", "b.md", "c.md"].map((path) => ({
        note: {
          id: as_note_path(path),
          path: as_note_path(path),
          name: path.replace(".md", ""),
          title: path.replace(".md", ""),
          mtime_ms: 0,
          size_bytes: 0,
        },
        score: 1,
      }));
      const search_port = make_search_port({
        search_notes_results: fts_results,
        hybrid_search_results: [make_note_hit("docs/semantic.md")],
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      const result = await service.search_omnibar("three word query here");

      expect(search_port.hybrid_search).not.toHaveBeenCalled();
      expect(result.items).toHaveLength(3);
    });

    it("deduplicates hybrid results that overlap with FTS results by path", async () => {
      const fts_results = [
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 1,
        },
      ];
      const hybrid_hits: HybridSearchHit[] = [
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 0.9,
          source: "both",
        },
        make_note_hit("docs/b.md", 0.8),
      ];

      const search_port = make_search_port({
        search_notes_results: fts_results,
        hybrid_search_results: hybrid_hits,
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      const result = await service.search_omnibar("query with enough words");

      expect(result.items).toHaveLength(2);
      const paths = result.items
        .filter((item) => item.kind === "note")
        .map((item) => (item.kind === "note" ? String(item.note.path) : ""));
      expect(paths).toEqual(["docs/a.md", "docs/b.md"]);
    });

    it("omits source field from FTS-only items", async () => {
      const fts_results = [
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            mtime_ms: 0,
            size_bytes: 0,
          },
          score: 1,
          snippet: "match",
        },
      ];
      const search_port = make_search_port({
        search_notes_results: fts_results,
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      const result = await service.search_omnibar("quick fts");

      expect(search_port.hybrid_search).not.toHaveBeenCalled();
      const item = result.items[0];
      expect(item?.kind).toBe("note");
      if (item?.kind === "note") {
        expect(item.source).toBeUndefined();
      }
    });
  });
});
