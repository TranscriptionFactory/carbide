/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi } from "vitest";
import { GraphService } from "$lib/features/graph/application/graph_service";
import type {
  GraphPort,
  GraphNeighborhoodSnapshot,
} from "$lib/features/graph/ports";
import { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { EditorStore } from "$lib/features/editor";
import type { SearchPort } from "$lib/features/search/ports";
import type { SearchService } from "$lib/features/search";
import type { VaultId, NoteId, NotePath } from "$lib/shared/types/ids";

describe("GraphService", () => {
  const mock_graph_port = {
    load_note_neighborhood: vi.fn(),
    invalidate_cache: vi.fn().mockResolvedValue(undefined),
    cache_stats: vi.fn().mockResolvedValue({
      size: 0,
      hits: 0,
      misses: 0,
      insertions: 0,
      evictions: 0,
      hit_rate: 0,
    }),
  } as unknown as GraphPort;

  const mock_vault_store = {
    vault: { id: "vault-1" as VaultId },
  } as unknown as VaultStore;

  const mock_editor_store = {
    open_note: {
      meta: {
        id: "note-1" as NoteId,
        path: "test.md" as NotePath,
        title: "Test",
      },
    },
  } as unknown as EditorStore;

  const mock_search_port = {
    find_similar_notes: vi.fn().mockResolvedValue([]),
    semantic_search_batch: vi.fn().mockResolvedValue([]),
  } as unknown as SearchPort;

  const mock_search_service = {
    run_search_pipeline: vi.fn().mockResolvedValue({ hits: [] }),
  } as unknown as SearchService;

  const graph_store = new GraphStore();

  const service = new GraphService(
    mock_graph_port,
    mock_search_port,
    mock_search_service,
    mock_vault_store,
    mock_editor_store,
    graph_store,
  );

  it("loads note neighborhood and updates store", async () => {
    const snapshot = {
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    } as unknown as GraphNeighborhoodSnapshot;
    vi.mocked(mock_graph_port.load_note_neighborhood).mockResolvedValue(
      snapshot,
    );

    await service.load_note_neighborhood("test.md");

    expect(
      vi.mocked(mock_graph_port.load_note_neighborhood),
    ).toHaveBeenCalledWith("vault-1", "test.md");
    expect(graph_store.snapshot).toEqual(snapshot);
    expect(graph_store.status).toBe("ready");
    expect(graph_store.panel_open).toBe(true);
  });

  it("handles loading error", async () => {
    vi.mocked(mock_graph_port.load_note_neighborhood).mockRejectedValue(
      new Error("Failed"),
    );

    await service.load_note_neighborhood("test.md");

    expect(graph_store.status).toBe("error");
    expect(graph_store.error).toBe("Failed");
  });

  it("focuses active note", async () => {
    const snapshot = {
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    } as unknown as GraphNeighborhoodSnapshot;
    vi.mocked(mock_graph_port.load_note_neighborhood).mockResolvedValue(
      snapshot,
    );

    await service.focus_active_note();

    expect(
      vi.mocked(mock_graph_port.load_note_neighborhood),
    ).toHaveBeenCalledWith("vault-1", "test.md");
    expect(graph_store.center_note_path).toBe("test.md");
  });

  it("clears store if no vault is active", async () => {
    const service_no_vault = new GraphService(
      mock_graph_port,
      mock_search_port,
      mock_search_service,
      { vault: null } as unknown as VaultStore,
      mock_editor_store,
      graph_store,
    );

    await service_no_vault.load_note_neighborhood("test.md");

    expect(graph_store.panel_open).toBe(false);
    expect(graph_store.status).toBe("idle");
  });

  it("clear() invalidates in-flight neighborhood loads", async () => {
    let resolve_load: (v: GraphNeighborhoodSnapshot) => void;
    const deferred = new Promise<GraphNeighborhoodSnapshot>((r) => {
      resolve_load = r;
    });
    vi.mocked(mock_graph_port.load_note_neighborhood).mockReturnValue(deferred);

    const load_promise = service.load_note_neighborhood("test.md");
    service.clear();

    resolve_load!({
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    } as unknown as GraphNeighborhoodSnapshot);

    await load_promise;
    expect(graph_store.status).toBe("idle");
    expect(graph_store.snapshot).toBeNull();
  });

  it("refreshes current graph", async () => {
    graph_store.start_loading("test.md");
    const snapshot = {
      center: { path: "test.md" },
      backlinks: [],
      outlinks: [],
      orphan_links: [],
      stats: {},
    } as unknown as GraphNeighborhoodSnapshot;
    vi.mocked(mock_graph_port.load_note_neighborhood).mockResolvedValue(
      snapshot,
    );

    await service.refresh_current();

    expect(
      vi.mocked(mock_graph_port.load_note_neighborhood),
    ).toHaveBeenCalledWith("vault-1", "test.md");
  });
});

function create_deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type PipelineResult = {
  hits: { note: { path: string; title: string }; score: number }[];
};

function pipeline_result(...paths: string[]): PipelineResult {
  return {
    hits: paths.map((path) => ({ note: { path, title: path }, score: 1 })),
  };
}

function hit_paths(store: SearchGraphStore, tab_id: string): string[] {
  return (
    store
      .get_instance(tab_id)
      ?.snapshot?.nodes.filter((n) => n.kind === "hit")
      .map((n) => n.path) ?? []
  );
}

function setup_search_graph() {
  const graph_store = new GraphStore();
  graph_store.set_vault_snapshot({
    nodes: [],
    edges: [],
    stats: { node_count: 0, edge_count: 0 },
  });
  const search_graph_store = new SearchGraphStore();
  search_graph_store.create_instance("tab-1", "");
  const search_port = {
    semantic_search: vi.fn().mockResolvedValue([]),
    semantic_search_batch: vi.fn().mockResolvedValue([]),
    find_similar_notes: vi.fn().mockResolvedValue([]),
    compute_smart_link_vault_edges: vi.fn().mockResolvedValue([]),
  } as unknown as SearchPort;
  const search_service = {
    run_search_pipeline: vi.fn(),
  } as unknown as SearchService;
  const service = new GraphService(
    { load_vault_graph: vi.fn() } as unknown as GraphPort,
    search_port,
    search_service,
    { vault: { id: "vault-1" as VaultId } } as unknown as VaultStore,
    {} as unknown as EditorStore,
    graph_store,
    search_graph_store,
  );
  const queue_pipeline = () => {
    const d = create_deferred<PipelineResult>();
    vi.mocked(search_service.run_search_pipeline).mockReturnValueOnce(
      d.promise as never,
    );
    return d;
  };
  return { service, search_graph_store, search_port, queue_pipeline };
}

describe("GraphService search graph stale results", () => {
  it("ignores an older search that resolves after a newer one", async () => {
    const { service, search_graph_store, queue_pipeline } =
      setup_search_graph();
    const older = queue_pipeline();
    const newer = queue_pipeline();

    const older_run = service.execute_search_graph("tab-1", "old");
    const newer_run = service.execute_search_graph("tab-1", "new");
    newer.resolve(pipeline_result("new.md"));
    await newer_run;
    older.resolve(pipeline_result("old.md"));
    await older_run;

    expect(hit_paths(search_graph_store, "tab-1")).toEqual(["new.md"]);
    expect(search_graph_store.get_instance("tab-1")?.query).toBe("new");
    expect(search_graph_store.get_instance("tab-1")?.status).toBe("ready");
  });

  it("does not let an older failure clobber a newer result", async () => {
    const { service, search_graph_store, queue_pipeline } =
      setup_search_graph();
    const older = queue_pipeline();
    const newer = queue_pipeline();

    const older_run = service.execute_search_graph("tab-1", "old");
    const newer_run = service.execute_search_graph("tab-1", "new");
    newer.resolve(pipeline_result("new.md"));
    await newer_run;
    older.reject(new Error("boom"));
    await older_run;

    const instance = search_graph_store.get_instance("tab-1");
    expect(instance?.status).toBe("ready");
    expect(instance?.error).toBeNull();
    expect(hit_paths(search_graph_store, "tab-1")).toEqual(["new.md"]);
  });

  it("keeps searches in different tabs independent", async () => {
    const { service, search_graph_store, queue_pipeline } =
      setup_search_graph();
    search_graph_store.create_instance("tab-2", "");
    const first = queue_pipeline();
    const second = queue_pipeline();

    const first_run = service.execute_search_graph("tab-1", "one");
    const second_run = service.execute_search_graph("tab-2", "two");
    second.resolve(pipeline_result("two.md"));
    first.resolve(pipeline_result("one.md"));
    await Promise.all([first_run, second_run]);

    expect(hit_paths(search_graph_store, "tab-1")).toEqual(["one.md"]);
    expect(hit_paths(search_graph_store, "tab-2")).toEqual(["two.md"]);
  });

  it("drops an expansion that finishes after a new search", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md"));
    await service.execute_search_graph("tab-1", "first");
    const similar = create_deferred<unknown[]>();
    vi.mocked(search_port.find_similar_notes).mockReturnValueOnce(
      similar.promise as never,
    );

    const expand_run = service.expand_search_graph_node("tab-1", "a.md");
    queue_pipeline().resolve(pipeline_result("b.md"));
    await service.execute_search_graph("tab-1", "second");
    similar.resolve([{ note: { path: "c.md", title: "C" }, distance: 0.1 }]);
    await expand_run;

    expect(hit_paths(search_graph_store, "tab-1")).toEqual(["b.md"]);
  });

  it("applies an expansion when no newer search was issued", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md"));
    await service.execute_search_graph("tab-1", "first");
    vi.mocked(search_port.find_similar_notes).mockResolvedValueOnce([
      { note: { path: "c.md", title: "C" }, distance: 0.1 },
    ] as never);

    await service.expand_search_graph_node("tab-1", "a.md");

    expect(hit_paths(search_graph_store, "tab-1")).toEqual(["a.md", "c.md"]);
  });

  it("drops semantic edges computed for a result a new search replaced", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md", "b.md"));
    await service.execute_search_graph("tab-1", "first");
    const batch = create_deferred<unknown[]>();
    vi.mocked(search_port.semantic_search_batch).mockReturnValueOnce(
      batch.promise as never,
    );

    const toggle_run = service.toggle_search_graph_semantic_edges("tab-1");
    queue_pipeline().resolve(pipeline_result("c.md"));
    await service.execute_search_graph("tab-1", "second");
    batch.resolve([{ source: "a.md", target: "b.md", distance: 0.1 }]);
    await toggle_run;

    expect(hit_paths(search_graph_store, "tab-1")).toEqual(["c.md"]);
    expect(
      search_graph_store.get_instance("tab-1")?.snapshot?.stats
        .semantic_edge_count,
    ).toBe(0);
  });

  it("includes semantic edges toggled on while the search was in flight", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      setup_search_graph();
    vi.mocked(search_port.semantic_search_batch).mockResolvedValue([
      { source: "a.md", target: "b.md", distance: 0.1 },
    ]);
    const boost = create_deferred<unknown[]>();
    vi.mocked(search_port.semantic_search).mockReturnValueOnce(
      boost.promise as never,
    );
    queue_pipeline().resolve(pipeline_result("a.md", "b.md"));

    const run = service.execute_search_graph("tab-1", "q");
    await vi.waitFor(() => {
      expect(search_port.semantic_search).toHaveBeenCalled();
    });
    search_graph_store.toggle_semantic_edges("tab-1");
    boost.resolve([]);
    await run;

    const instance = search_graph_store.get_instance("tab-1");
    expect(instance?.semantic_edges).toHaveLength(1);
    expect(instance?.snapshot?.stats.semantic_edge_count).toBe(1);
  });
});

describe("GraphService search graph interaction state", () => {
  function interact(store: SearchGraphStore) {
    store.select_node("tab-1", "a.md");
    store.toggle_selected("tab-1", "a.md");
    store.set_hovered_node("tab-1", "a.md");
    store.toggle_user_expanded("tab-1", "a.md");
  }

  it("resets selection, hover and expansion when a new query lands", async () => {
    const { service, search_graph_store, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md"));
    await service.execute_search_graph("tab-1", "first");
    interact(search_graph_store);

    queue_pipeline().resolve(pipeline_result("b.md"));
    await service.execute_search_graph("tab-1", "second");

    const instance = search_graph_store.get_instance("tab-1");
    expect(instance?.selected_node_id).toBeNull();
    expect(instance?.selected_node_ids.size).toBe(0);
    expect(instance?.hovered_node_id).toBeNull();
    expect(instance?.user_expanded_ids.size).toBe(0);
    expect(instance?.scroll_to_path).toBeNull();
  });

  it("keeps selection and expansion across find-similar and semantic toggles", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md", "b.md"));
    await service.execute_search_graph("tab-1", "first");
    interact(search_graph_store);
    vi.mocked(search_port.find_similar_notes).mockResolvedValueOnce([
      { note: { path: "c.md", title: "C" }, distance: 0.1 },
    ] as never);

    await service.expand_search_graph_node("tab-1", "a.md");
    await service.toggle_search_graph_semantic_edges("tab-1");

    const instance = search_graph_store.get_instance("tab-1");
    expect(instance?.selected_node_id).toBe("a.md");
    expect(instance?.selected_node_ids.has("a.md")).toBe(true);
    expect(instance?.hovered_node_id).toBe("a.md");
    expect(instance?.user_expanded_ids.has("a.md")).toBe(true);
  });
});

describe("GraphService.toggle_search_graph_smart_link_edges", () => {
  const RAW_EDGE = {
    sourcePath: "a.md",
    targetPath: "b.md",
    score: 0.8,
    rules: [{ ruleId: "same_tag", rawScore: 1 }],
  };

  async function setup_executed() {
    const context = setup_search_graph();
    context.queue_pipeline().resolve(pipeline_result("a.md", "b.md"));
    await context.service.execute_search_graph("tab-1", "q");
    return context;
  }

  it("loads smart link edges on first toggle and applies them to the result", async () => {
    const { service, search_graph_store, search_port } = await setup_executed();
    vi.mocked(search_port.compute_smart_link_vault_edges).mockResolvedValueOnce(
      [RAW_EDGE] as never,
    );

    await service.toggle_search_graph_smart_link_edges("tab-1");

    const instance = search_graph_store.get_instance("tab-1");
    expect(instance?.show_smart_link_edges).toBe(true);
    expect(search_port.compute_smart_link_vault_edges).toHaveBeenCalledTimes(1);
    expect(instance?.snapshot?.stats.smart_link_edge_count).toBe(1);
  });

  it("reuses loaded edges when toggled off and on again", async () => {
    const { service, search_graph_store, search_port } = await setup_executed();
    vi.mocked(search_port.compute_smart_link_vault_edges).mockResolvedValueOnce(
      [RAW_EDGE] as never,
    );

    await service.toggle_search_graph_smart_link_edges("tab-1");
    await service.toggle_search_graph_smart_link_edges("tab-1");
    await service.toggle_search_graph_smart_link_edges("tab-1");

    expect(search_port.compute_smart_link_vault_edges).toHaveBeenCalledTimes(1);
    expect(
      search_graph_store.get_instance("tab-1")?.snapshot?.stats
        .smart_link_edge_count,
    ).toBe(1);
  });

  it("decorates the result that replaced the one on screen during the load", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      await setup_executed();
    const load = create_deferred<unknown[]>();
    vi.mocked(search_port.compute_smart_link_vault_edges).mockReturnValueOnce(
      load.promise as never,
    );

    const toggle_run = service.toggle_search_graph_smart_link_edges("tab-1");
    queue_pipeline().resolve(pipeline_result("a.md", "b.md", "c.md"));
    await service.execute_search_graph("tab-1", "q2");
    load.resolve([RAW_EDGE]);
    await toggle_run;

    const snapshot = search_graph_store.get_instance("tab-1")?.snapshot;
    expect(snapshot?.stats.hit_count).toBe(3);
    expect(snapshot?.stats.smart_link_edge_count).toBe(1);
  });

  it("leaves an in-flight search to pick the loaded edges up itself", async () => {
    const { service, search_graph_store, search_port, queue_pipeline } =
      await setup_executed();
    const pending = queue_pipeline();
    const run = service.execute_search_graph("tab-1", "q2");
    vi.mocked(search_port.compute_smart_link_vault_edges).mockResolvedValueOnce(
      [RAW_EDGE] as never,
    );

    await service.toggle_search_graph_smart_link_edges("tab-1");
    expect(search_graph_store.get_instance("tab-1")?.status).toBe("loading");
    pending.resolve(pipeline_result("a.md", "b.md"));
    await run;

    const instance = search_graph_store.get_instance("tab-1");
    expect(instance?.status).toBe("ready");
    expect(instance?.snapshot?.stats.smart_link_edge_count).toBe(1);
  });
});

describe("GraphService.ensure_search_graph", () => {
  it("creates the instance and runs the search for a tab that has none", async () => {
    const { service, search_graph_store, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md"));

    await service.ensure_search_graph("tab-2", "alpha");

    const instance = search_graph_store.get_instance("tab-2");
    expect(instance?.query).toBe("alpha");
    expect(instance?.status).toBe("ready");
    expect(hit_paths(search_graph_store, "tab-2")).toEqual(["a.md"]);
  });

  it("creates an idle instance without searching for an empty query", async () => {
    const { service, search_graph_store } = setup_search_graph();

    await service.ensure_search_graph("tab-2", "");

    expect(search_graph_store.get_instance("tab-2")?.status).toBe("idle");
  });

  it("leaves an existing instance and its result alone", async () => {
    const { service, search_graph_store, queue_pipeline } =
      setup_search_graph();
    queue_pipeline().resolve(pipeline_result("a.md"));
    await service.execute_search_graph("tab-1", "first");
    const before = search_graph_store.get_instance("tab-1");

    await service.ensure_search_graph("tab-1", "other");

    expect(search_graph_store.get_instance("tab-1")).toBe(before);
  });
});
