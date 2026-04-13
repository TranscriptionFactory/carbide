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
      blurb: "",
      mtime_ms: 0,
      ctime_ms: 0,
      size_bytes: 0,
      file_type: null,
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
            blurb: "",
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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
      semantic_search_batch: vi.fn().mockResolvedValue([]),
      rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
      get_note_stats: vi.fn().mockResolvedValue({}),
      get_file_cache: vi.fn().mockResolvedValue({}),
      load_smart_link_rules: vi.fn().mockResolvedValue([]),
      save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
      compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
      compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
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

  describe("search_omnibar hybrid search", () => {
    function make_note_hit(path: string, score = 1): HybridSearchHit {
      return {
        note: {
          id: as_note_path(path),
          path: as_note_path(path),
          name: path.split("/").at(-1)?.replace(".md", "") ?? "",
          title: path.split("/").at(-1)?.replace(".md", "") ?? "",
          blurb: "",
          mtime_ms: 0,
          ctime_ms: 0,
          size_bytes: 0,
          file_type: null,
        },
        score,
        source: "vector",
      };
    }

    function make_search_port(overrides: {
      search_notes_results?: NoteSearchHit[];
      hybrid_search_results?: HybridSearchHit[];
      hybrid_search_error?: Error;
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
        hybrid_search: overrides.hybrid_search_error
          ? vi.fn().mockRejectedValue(overrides.hybrid_search_error)
          : vi.fn().mockResolvedValue(overrides.hybrid_search_results ?? []),
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

    it("uses hybrid search as the primary path for notes domain queries", async () => {
      const hybrid_hit = make_note_hit("docs/semantic.md", 0.9);
      const search_port = make_search_port({
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

      const result = await service.search_omnibar("notes");

      expect(search_port.hybrid_search).toHaveBeenCalledTimes(1);
      expect(search_port.search_notes).not.toHaveBeenCalled();
      expect(result.domain).toBe("notes");
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({
        kind: "note",
        source: "vector",
      });
    });

    it("falls back to FTS when hybrid search throws", async () => {
      const fts_results = [
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            blurb: "",
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
          },
          score: 1,
          snippet: "match",
        },
      ];
      const search_port = make_search_port({
        search_notes_results: fts_results,
        hybrid_search_error: new Error("embeddings unavailable"),
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      const result = await service.search_omnibar("test query");

      expect(search_port.hybrid_search).toHaveBeenCalledTimes(1);
      expect(search_port.search_notes).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toMatchObject({ kind: "note" });
      if (result.items[0]?.kind === "note") {
        expect(result.items[0].source).toBeUndefined();
      }
    });

    it("skips hybrid search when semantic_enabled is false", async () => {
      const fts_results = [
        {
          note: {
            id: as_note_path("docs/a.md"),
            path: as_note_path("docs/a.md"),
            name: "a",
            title: "a",
            blurb: "",
            mtime_ms: 0,
            ctime_ms: 0,
            size_bytes: 0,
            file_type: null,
          },
          score: 1,
          snippet: "match",
        },
      ];
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

      const result = await service.search_omnibar("test query", false);

      expect(search_port.hybrid_search).not.toHaveBeenCalled();
      expect(search_port.search_notes).toHaveBeenCalledTimes(1);
      expect(result.items).toHaveLength(1);
    });

    it("commands and planned domains still skip hybrid search", async () => {
      const search_port = make_search_port({
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

      const commands_result = await service.search_omnibar(">settings");
      expect(commands_result.domain).toBe("commands");
      expect(search_port.hybrid_search).not.toHaveBeenCalled();

      const planned_result = await service.search_omnibar("#planned query");
      expect(planned_result.domain).toBe("planned");
      expect(search_port.hybrid_search).not.toHaveBeenCalled();
    });
  });

  describe("get_note_headings", () => {
    function make_base_search_port() {
      return {
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

    it("returns headings from the file cache", async () => {
      const headings = [
        { level: 1, text: "Introduction", line: 0 },
        { level: 2, text: "Background", line: 5 },
        { level: 2, text: "Methods", line: 12 },
      ];
      const search_port = make_base_search_port();
      search_port.get_file_cache = vi.fn().mockResolvedValue({
        frontmatter: {},
        tags: [],
        headings,
        links: [],
        embeds: [],
        stats: {},
        ctime_ms: 0,
        mtime_ms: 0,
        size_bytes: 0,
      });

      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new SearchService(
        search_port,
        vault_store,
        new OpStore(),
        () => 1,
      );

      const result = await service.get_note_headings(
        as_vault_id("test-vault"),
        "docs/note.md",
      );

      expect(result).toEqual(headings);
      expect(search_port.get_file_cache).toHaveBeenCalledWith(
        as_vault_id("test-vault"),
        "docs/note.md",
      );
    });

    it("returns empty array when get_file_cache throws", async () => {
      const search_port = make_base_search_port();
      search_port.get_file_cache = vi
        .fn()
        .mockRejectedValue(new Error("not found"));

      const service = new SearchService(
        search_port,
        new VaultStore(),
        new OpStore(),
        () => 1,
      );

      const result = await service.get_note_headings(
        as_vault_id("test-vault"),
        "missing/note.md",
      );

      expect(result).toEqual([]);
    });
  });
});
