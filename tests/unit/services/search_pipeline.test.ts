import { describe, expect, it, vi } from "vitest";
import { SearchService } from "$lib/features/search/application/search_service";
import { GraphService } from "$lib/features/graph/application/graph_service";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { SearchPort } from "$lib/features/search/ports";
import type { GraphPort } from "$lib/features/graph/ports";
import type { HybridSearchHit } from "$lib/shared/types/search";
import { type VaultId, as_vault_id } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import { as_note_path } from "$lib/shared/types/ids";

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
    source: "both",
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

function make_mock_graph_port(): GraphPort {
  return {
    load_note_neighborhood: vi.fn().mockResolvedValue({
      center: {},
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    }),
    load_vault_graph: vi.fn().mockResolvedValue({
      nodes: [],
      edges: [],
      stats: { node_count: 0, edge_count: 0 },
    }),
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
    cache_stats: vi.fn().mockResolvedValue({
      size: 0,
      hits: 0,
      misses: 0,
      insertions: 0,
      evictions: 0,
      hit_rate: 0,
    }),
  };
}

describe("SearchService.run_search_pipeline", () => {
  it("returns hybrid search hits", async () => {
    const hits = [make_note_hit("docs/a.md", 0.9)];
    const search_port = make_mock_search_port(hits);
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ id: "vault-1" as VaultId }));

    const service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );

    const result = await service.run_search_pipeline(
      as_vault_id("vault-1"),
      "test query",
    );

    expect(result.hits).toHaveLength(1);
    expect(result.hits[0]!.note.path).toBe("docs/a.md");
  });

  it("passes parsed scope to hybrid_search", async () => {
    const search_port = make_mock_search_port([]);
    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    await service.run_search_pipeline(as_vault_id("vault-1"), "title:react");

    expect(search_port.hybrid_search).toHaveBeenCalledWith(
      "vault-1",
      expect.objectContaining({ text: "react", scope: "title" }),
      20,
    );
  });

  it("passes scope 'all' for unscoped queries", async () => {
    const search_port = make_mock_search_port([]);
    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    await service.run_search_pipeline(as_vault_id("vault-1"), "general query");

    expect(search_port.hybrid_search).toHaveBeenCalledWith(
      "vault-1",
      expect.objectContaining({ text: "general query", scope: "all" }),
      20,
    );
  });

  it("respects custom limit option", async () => {
    const search_port = make_mock_search_port([]);
    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    await service.run_search_pipeline(as_vault_id("vault-1"), "query", {
      limit: 50,
    });

    expect(search_port.hybrid_search).toHaveBeenCalledWith(
      "vault-1",
      expect.any(Object),
      50,
    );
  });

  it("propagates errors from hybrid_search", async () => {
    const search_port = make_mock_search_port([]);
    (search_port.hybrid_search as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("search failed"),
    );

    const service = new SearchService(
      search_port,
      new VaultStore(),
      new OpStore(),
      () => 1,
    );

    await expect(
      service.run_search_pipeline(as_vault_id("vault-1"), "query"),
    ).rejects.toThrow("search failed");
  });
});

describe("GraphService uses shared search pipeline", () => {
  it("calls run_search_pipeline instead of search_port.hybrid_search", async () => {
    const hits = [make_note_hit("docs/a.md", 0.9)];
    const search_port = make_mock_search_port(hits);
    const graph_port = make_mock_graph_port();

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ id: "vault-1" as VaultId }));

    const search_service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );
    const run_pipeline_spy = vi.spyOn(search_service, "run_search_pipeline");

    const graph_store = new GraphStore();
    const search_graph_store = new SearchGraphStore();
    search_graph_store.create_instance("tab-1", "");

    const graph_service = new GraphService(
      graph_port,
      search_port,
      search_service,
      vault_store,
      new EditorStore(),
      graph_store,
      search_graph_store,
    );

    await graph_service.execute_search_graph("tab-1", "test query");

    expect(run_pipeline_spy).toHaveBeenCalledWith("vault-1", "test query", {
      limit: 50,
    });
    expect(search_port.hybrid_search).toHaveBeenCalledTimes(1);
  });

  it("graph search inherits scope parsing from the pipeline", async () => {
    const search_port = make_mock_search_port([]);
    const graph_port = make_mock_graph_port();

    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ id: "vault-1" as VaultId }));

    const search_service = new SearchService(
      search_port,
      vault_store,
      new OpStore(),
      () => 1,
    );

    const graph_store = new GraphStore();
    const search_graph_store = new SearchGraphStore();
    search_graph_store.create_instance("tab-1", "");

    const graph_service = new GraphService(
      graph_port,
      search_port,
      search_service,
      vault_store,
      new EditorStore(),
      graph_store,
      search_graph_store,
    );

    await graph_service.execute_search_graph("tab-1", "title:react");

    expect(search_port.hybrid_search).toHaveBeenCalledWith(
      "vault-1",
      expect.objectContaining({ text: "react", scope: "title" }),
      50,
    );
  });
});
