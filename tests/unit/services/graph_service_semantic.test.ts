import { describe, expect, it, vi } from "vitest";
import { GraphService } from "$lib/features/graph/application/graph_service";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { GraphPort, SemanticEdge } from "$lib/features/graph/ports";
import type { SearchPort } from "$lib/features/search/ports";
import type { VaultId } from "$lib/shared/types/ids";
import { create_test_vault } from "../helpers/test_fixtures";

function make_edge(
  source: string,
  target: string,
  distance: number,
): SemanticEdge {
  return { source, target, distance };
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

function make_mock_search_port(batch_edges: SemanticEdge[] = []): SearchPort {
  return {
    find_similar_notes: vi.fn().mockResolvedValue([]),
    semantic_search_batch: vi.fn().mockResolvedValue(batch_edges),
    search_notes: vi.fn().mockResolvedValue([]),
    suggest_wiki_links: vi.fn().mockResolvedValue([]),
    suggest_planned_links: vi.fn().mockResolvedValue([]),
    get_note_links_snapshot: vi
      .fn()
      .mockResolvedValue({ backlinks: [], outlinks: [], orphan_links: [] }),
    extract_local_note_links: vi
      .fn()
      .mockResolvedValue({ outlink_paths: [], external_links: [] }),
    rewrite_note_links: vi
      .fn()
      .mockResolvedValue({ markdown: "", changed: false }),
    resolve_note_link: vi.fn().mockResolvedValue(null),
    resolve_wiki_link: vi.fn().mockResolvedValue(null),
    semantic_search: vi.fn().mockResolvedValue([]),
    hybrid_search: vi.fn().mockResolvedValue([]),
    get_embedding_status: vi.fn().mockResolvedValue({
      total_notes: 10,
      embedded_notes: 10,
      model_version: "bge-small-en-v1.5-q",
      is_embedding: false,
    }),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
    get_note_stats: vi.fn().mockResolvedValue({}),
    get_file_cache: vi.fn().mockResolvedValue({}),
    load_smart_link_rules: vi.fn().mockResolvedValue([]),
    save_smart_link_rules: vi.fn().mockResolvedValue(undefined),
    compute_smart_link_suggestions: vi.fn().mockResolvedValue([]),
    compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
  };
}

function setup(batch_edges?: SemanticEdge[]) {
  const graph_store = new GraphStore();
  const vault_store = new VaultStore();
  const editor_store = new EditorStore();
  const graph_port = make_mock_graph_port();
  const search_port = make_mock_search_port(batch_edges);

  vault_store.set_vault(create_test_vault({ id: "vault-1" as VaultId }));

  const service = new GraphService(
    graph_port,
    search_port,
    vault_store,
    editor_store,
    graph_store,
  );

  return { service, graph_store, search_port };
}

describe("GraphService.load_semantic_edges", () => {
  it("does nothing when vault snapshot is null", async () => {
    const { service, graph_store } = setup();
    await service.load_semantic_edges();
    expect(graph_store.semantic_edges).toHaveLength(0);
  });

  it("does nothing when vault has more than 500 nodes", async () => {
    const { service, graph_store, search_port } = setup();
    const nodes = Array.from({ length: 501 }, (_, i) => ({
      path: `note-${String(i)}.md`,
      title: `Note ${String(i)}`,
    }));
    graph_store.set_vault_snapshot({
      nodes,
      edges: [],
      stats: { node_count: 501, edge_count: 0 },
    });

    await service.load_semantic_edges();
    expect(search_port.semantic_search_batch).not.toHaveBeenCalled();
    expect(graph_store.semantic_edges).toHaveLength(0);
  });

  it("does nothing when no embeddings exist", async () => {
    const edges = [make_edge("a.md", "b.md", 0.2)];
    const { service, graph_store, search_port } = setup(edges);

    (
      search_port.get_embedding_status as ReturnType<typeof vi.fn>
    ).mockResolvedValue({
      total_notes: 5,
      embedded_notes: 0,
      model_version: "",
      is_embedding: false,
    });

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.load_semantic_edges();
    expect(search_port.semantic_search_batch).not.toHaveBeenCalled();
    expect(graph_store.semantic_edges).toHaveLength(0);
  });

  it("populates semantic edges from batch KNN results", async () => {
    const edges = [
      make_edge("a.md", "b.md", 0.2),
      make_edge("b.md", "c.md", 0.3),
    ];
    const { service, graph_store } = setup(edges);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
        { path: "c.md", title: "C" },
      ],
      edges: [],
      stats: { node_count: 3, edge_count: 0 },
    });

    await service.load_semantic_edges();
    expect(graph_store.semantic_edges).toHaveLength(2);
  });

  it("passes correct parameters to batch call", async () => {
    const { service, graph_store, search_port } = setup([]);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.load_semantic_edges({
      knn_limit: 5,
      distance_threshold: 0.8,
    });

    expect(search_port.semantic_search_batch).toHaveBeenCalledWith(
      "vault-1",
      ["a.md", "b.md"],
      5,
      0.19999999999999996, // 1 - 0.8
    );
  });

  it("uses default distance threshold when none specified", async () => {
    const { service, graph_store, search_port } = setup([]);

    graph_store.set_vault_snapshot({
      nodes: [{ path: "a.md", title: "A" }],
      edges: [],
      stats: { node_count: 1, edge_count: 0 },
    });

    await service.load_semantic_edges();

    expect(search_port.semantic_search_batch).toHaveBeenCalledWith(
      "vault-1",
      ["a.md"],
      3,
      0.5,
    );
  });

  it("respects custom max_vault_size setting", async () => {
    const edges = [make_edge("a.md", "b.md", 0.1)];
    const { service, graph_store, search_port } = setup(edges);

    const nodes = Array.from({ length: 150 }, (_, i) => ({
      path: `note-${String(i)}.md`,
      title: `Note ${String(i)}`,
    }));
    graph_store.set_vault_snapshot({
      nodes,
      edges: [],
      stats: { node_count: 150, edge_count: 0 },
    });

    await service.load_semantic_edges({ max_vault_size: 100 });
    expect(search_port.semantic_search_batch).not.toHaveBeenCalled();

    await service.load_semantic_edges({ max_vault_size: 200 });
    expect(search_port.semantic_search_batch).toHaveBeenCalled();
  });
});

describe("GraphService.toggle_semantic_edges", () => {
  it("toggles show_semantic_edges on", async () => {
    const { service, graph_store } = setup();
    expect(graph_store.show_semantic_edges).toBe(false);
    await service.toggle_semantic_edges();
    expect(graph_store.show_semantic_edges).toBe(true);
  });

  it("triggers load when toggling on and edges are empty", async () => {
    const edges = [make_edge("a.md", "b.md", 0.1)];
    const { service, graph_store, search_port } = setup(edges);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.toggle_semantic_edges();
    expect(search_port.semantic_search_batch).toHaveBeenCalled();
    expect(graph_store.semantic_edges).toHaveLength(1);
  });

  it("reloads edges after cache is cleared (simulating settings change)", async () => {
    const edges = [make_edge("a.md", "b.md", 0.1)];
    const { service, graph_store, search_port } = setup(edges);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.toggle_semantic_edges();
    expect(graph_store.semantic_edges).toHaveLength(1);

    const call_count = (
      search_port.semantic_search_batch as ReturnType<typeof vi.fn>
    ).mock.calls.length;

    graph_store.set_semantic_edges([]);
    await service.toggle_semantic_edges();
    await service.toggle_semantic_edges();

    expect(
      (search_port.semantic_search_batch as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBeGreaterThan(call_count);
  });

  it("does not reload when toggling off then on with cached edges", async () => {
    const edges = [make_edge("a.md", "b.md", 0.1)];
    const { service, graph_store, search_port } = setup(edges);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.toggle_semantic_edges();
    const call_count = (
      search_port.semantic_search_batch as ReturnType<typeof vi.fn>
    ).mock.calls.length;

    await service.toggle_semantic_edges();
    await service.toggle_semantic_edges();

    expect(
      (search_port.semantic_search_batch as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(call_count);
  });
});
