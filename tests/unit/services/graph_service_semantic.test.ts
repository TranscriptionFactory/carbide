import { describe, expect, it, vi } from "vitest";
import { GraphService } from "$lib/features/graph/application/graph_service";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import { EditorStore } from "$lib/features/editor/state/editor_store.svelte";
import type { GraphPort } from "$lib/features/graph/ports";
import type { SearchPort } from "$lib/features/search/ports";
import type { VaultId } from "$lib/shared/types/ids";
import type { SemanticSearchHit } from "$lib/shared/types/search";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_note_path } from "$lib/shared/types/ids";

function make_hit(path: string, distance: number): SemanticSearchHit {
  return {
    note: {
      id: as_note_path(path),
      path: as_note_path(path),
      name: path.replace(".md", ""),
      title: path,
      mtime_ms: 0,
      size_bytes: 0,
    },
    distance,
  };
}

function make_mock_graph_port(): GraphPort {
  return {
    load_note_neighborhood: vi
      .fn()
      .mockResolvedValue({
        center: {},
        backlinks: [],
        outlinks: [],
        orphan_links: [],
        stats: {},
      }),
    load_vault_graph: vi
      .fn()
      .mockResolvedValue({
        nodes: [],
        edges: [],
        stats: { node_count: 0, edge_count: 0 },
      }),
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
    cache_stats: vi
      .fn()
      .mockResolvedValue({
        size: 0,
        hits: 0,
        misses: 0,
        insertions: 0,
        evictions: 0,
        hit_rate: 0,
      }),
  };
}

function make_mock_search_port(
  hits: Map<string, SemanticSearchHit[]> = new Map(),
): SearchPort {
  return {
    find_similar_notes: vi
      .fn()
      .mockImplementation((_vault_id, note_path) =>
        Promise.resolve(hits.get(note_path) ?? []),
      ),
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
    get_embedding_status: vi
      .fn()
      .mockResolvedValue({
        total_notes: 0,
        embedded_notes: 0,
        model_version: "",
        is_embedding: false,
      }),
    rebuild_embeddings: vi.fn().mockResolvedValue(undefined),
  };
}

function setup(hits?: Map<string, SemanticSearchHit[]>) {
  const graph_store = new GraphStore();
  const vault_store = new VaultStore();
  const editor_store = new EditorStore();
  const graph_port = make_mock_graph_port();
  const search_port = make_mock_search_port(hits);

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

  it("does nothing when vault has more than 200 nodes", async () => {
    const { service, graph_store, search_port } = setup();
    const nodes = Array.from({ length: 201 }, (_, i) => ({
      path: `note-${String(i)}.md`,
      title: `Note ${String(i)}`,
    }));
    graph_store.set_vault_snapshot({
      nodes,
      edges: [],
      stats: { node_count: 201, edge_count: 0 },
    });

    await service.load_semantic_edges();
    expect(search_port.find_similar_notes).not.toHaveBeenCalled();
    expect(graph_store.semantic_edges).toHaveLength(0);
  });

  it("populates semantic edges from KNN results", async () => {
    const hits = new Map([
      ["a.md", [make_hit("b.md", 0.2)]],
      ["b.md", [make_hit("c.md", 0.3)]],
      ["c.md", []],
    ]);
    const { service, graph_store } = setup(hits);

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

  it("deduplicates bidirectional hits", async () => {
    const hits = new Map([
      ["a.md", [make_hit("b.md", 0.2)]],
      ["b.md", [make_hit("a.md", 0.2)]],
    ]);
    const { service, graph_store } = setup(hits);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.load_semantic_edges();
    expect(graph_store.semantic_edges).toHaveLength(1);
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
    const hits = new Map([["a.md", [make_hit("b.md", 0.1)]]]);
    const { service, graph_store, search_port } = setup(hits);

    graph_store.set_vault_snapshot({
      nodes: [
        { path: "a.md", title: "A" },
        { path: "b.md", title: "B" },
      ],
      edges: [],
      stats: { node_count: 2, edge_count: 0 },
    });

    await service.toggle_semantic_edges();
    expect(search_port.find_similar_notes).toHaveBeenCalled();
    expect(graph_store.semantic_edges).toHaveLength(1);
  });

  it("does not reload when toggling off then on with cached edges", async () => {
    const hits = new Map([["a.md", [make_hit("b.md", 0.1)]]]);
    const { service, graph_store, search_port } = setup(hits);

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
      search_port.find_similar_notes as ReturnType<typeof vi.fn>
    ).mock.calls.length;

    await service.toggle_semantic_edges();
    await service.toggle_semantic_edges();

    expect(
      (search_port.find_similar_notes as ReturnType<typeof vi.fn>).mock.calls
        .length,
    ).toBe(call_count);
  });
});
