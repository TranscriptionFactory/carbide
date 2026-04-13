import type { EditorStore } from "$lib/features/editor";
import type { GraphPort, SemanticEdge } from "$lib/features/graph/ports";
import type { SearchGraphStore } from "$lib/features/graph/state/search_graph_store.svelte";
import type { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import {
  SEMANTIC_EDGE_DISTANCE_THRESHOLD,
  SEMANTIC_EDGE_KNN_LIMIT,
  SEMANTIC_EDGE_MAX_VAULT_SIZE,
} from "$lib/features/graph/domain/semantic_edges";
import {
  SMART_LINK_EDGE_MAX_VAULT_SIZE,
  SMART_LINK_EDGE_MIN_SCORE,
  SMART_LINK_EDGE_PER_NOTE_LIMIT,
} from "$lib/features/graph/domain/smart_link_edges";
import type { SearchPort } from "$lib/features/search";
import {
  extract_search_subgraph,
  compute_auto_expanded_ids,
  merge_expansion_into_snapshot,
  type SearchSubgraphHit,
} from "$lib/features/graph/domain/search_subgraph";
import type { VaultStore } from "$lib/features/vault";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("graph_service");

export class GraphService {
  private neighborhood_load_revision = 0;
  private vault_load_revision = 0;
  private semantic_load_revision = 0;
  private smart_link_load_revision = 0;
  private hierarchy_load_revision = 0;

  constructor(
    private readonly graph_port: GraphPort,
    private readonly search_port: SearchPort,
    private readonly vault_store: VaultStore,
    private readonly editor_store: EditorStore,
    private readonly graph_store: GraphStore,
    private readonly search_graph_store?: SearchGraphStore,
  ) {}

  private get_active_vault_id() {
    return this.vault_store.vault?.id ?? null;
  }

  async load_note_neighborhood(note_path: string): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.graph_store.clear();
      return;
    }

    const revision = ++this.neighborhood_load_revision;
    this.graph_store.set_panel_open(true);
    this.graph_store.start_loading(note_path);

    try {
      const snapshot = await this.graph_port.load_note_neighborhood(
        vault_id,
        note_path,
      );
      if (revision !== this.neighborhood_load_revision) return;
      this.graph_store.set_snapshot(snapshot);
    } catch (error) {
      if (revision !== this.neighborhood_load_revision) return;
      const message = error_message(error);
      log.error("Load graph neighborhood failed", {
        error: message,
        note_path,
      });
      this.graph_store.set_error(note_path, message);
    }
  }

  async focus_active_note(): Promise<void> {
    this.graph_store.set_panel_open(true);
    this.graph_store.set_view_mode("neighborhood");

    const note_path = this.editor_store.open_note?.meta.path ?? null;
    if (!note_path) {
      this.graph_store.clear_snapshot();
      return;
    }

    await this.load_note_neighborhood(note_path);
  }

  async invalidate_cache(note_id?: string): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;
    await this.graph_port.invalidate_cache(vault_id, note_id);
  }

  async load_vault_graph(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    if (!vault_id) {
      this.graph_store.clear();
      return;
    }

    const revision = ++this.vault_load_revision;
    this.graph_store.start_loading_vault();

    log.info("Starting vault graph load", { vault_id });

    try {
      const timeout_ms = 15_000;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const snapshot = await Promise.race([
        this.graph_port.load_vault_graph(vault_id),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new Error(
                `Vault graph load timed out after ${String(timeout_ms)}ms`,
              ),
            );
          }, timeout_ms);
        }),
      ]).finally(() => clearTimeout(timer));
      if (revision !== this.vault_load_revision) return;
      log.info("Vault graph loaded", {
        nodes: snapshot.stats.node_count,
        edges: snapshot.stats.edge_count,
      });
      this.graph_store.set_vault_snapshot(snapshot);
    } catch (error) {
      if (revision !== this.vault_load_revision) return;
      const message = error_message(error);
      log.error("Load vault graph failed", { error: message });
      this.graph_store.set_error("vault", message);
    }
  }

  async load_hierarchy(_root_key: string | null = null): Promise<void> {
    this.graph_store.set_error("hierarchy", "Hierarchy view unavailable");
  }

  async toggle_view_mode(): Promise<void> {
    const current = this.graph_store.view_mode;
    if (current === "neighborhood") {
      this.graph_store.set_view_mode("vault");
      await this.load_vault_graph();
    } else if (current === "vault") {
      this.graph_store.set_view_mode("hierarchy");
      await this.load_hierarchy();
    } else {
      this.graph_store.set_view_mode("neighborhood");
      await this.focus_active_note();
    }
  }

  async refresh_current(): Promise<void> {
    if (this.graph_store.view_mode === "vault") {
      const vault_id = this.get_active_vault_id();
      if (!vault_id) return;
      await this.invalidate_cache();
      await this.load_vault_graph();
      return;
    }

    if (this.graph_store.view_mode === "hierarchy") {
      await this.load_hierarchy(this.graph_store.hierarchy_root_key);
      return;
    }

    const note_path = this.graph_store.center_note_path;
    if (!note_path) {
      return;
    }

    await this.invalidate_cache(note_path);
    await this.load_note_neighborhood(note_path);
  }

  close_panel(): void {
    this.graph_store.set_panel_open(false);
    this.graph_store.clear_interaction_state();
  }

  clear(): void {
    ++this.neighborhood_load_revision;
    ++this.vault_load_revision;
    ++this.semantic_load_revision;
    ++this.smart_link_load_revision;
    ++this.hierarchy_load_revision;
    this.graph_store.clear();
  }

  set_filter_query(query: string): void {
    this.graph_store.set_filter_query(query);
  }

  select_node(node_id: string | null): void {
    this.graph_store.select_node(node_id);
  }

  set_hovered_node(node_id: string | null): void {
    this.graph_store.set_hovered_node(node_id);
  }

  async load_semantic_edges(settings?: {
    max_vault_size?: number;
    knn_limit?: number;
    distance_threshold?: number;
  }): Promise<void> {
    const vault_id = this.get_active_vault_id();
    const snapshot = this.graph_store.vault_snapshot;
    if (!vault_id || !snapshot) return;

    const max_size = settings?.max_vault_size ?? SEMANTIC_EDGE_MAX_VAULT_SIZE;
    const knn_limit = settings?.knn_limit ?? SEMANTIC_EDGE_KNN_LIMIT;
    const threshold = settings?.distance_threshold;

    if (snapshot.stats.node_count > max_size) {
      log.warn("Vault too large for semantic edges", {
        node_count: snapshot.stats.node_count,
        max_size,
      });
      return;
    }

    try {
      const status = await this.search_port.get_embedding_status(vault_id);
      if (status.embedded_notes === 0) {
        log.warn("No embeddings found — semantic edges unavailable", {
          total_notes: status.total_notes,
          model_version: status.model_version,
        });
        return;
      }
      log.info("Loading semantic edges", {
        embedded: status.embedded_notes,
        total: status.total_notes,
        nodes: snapshot.stats.node_count,
        knn_limit,
        similarity_threshold: threshold,
      });
    } catch {
      log.warn("Could not check embedding status, proceeding anyway");
    }

    const revision = ++this.semantic_load_revision;
    const distance_cutoff =
      threshold !== undefined
        ? 1 - threshold
        : SEMANTIC_EDGE_DISTANCE_THRESHOLD;
    const paths = snapshot.nodes.map((n) => n.path);

    try {
      const edges = await this.search_port.semantic_search_batch(
        vault_id,
        paths,
        knn_limit,
        distance_cutoff,
      );
      if (revision !== this.semantic_load_revision) return;

      log.info("Semantic edges loaded", {
        notes_queried: paths.length,
        edges_built: edges.length,
        distance_cutoff,
      });

      this.graph_store.set_semantic_edges(edges);
    } catch (error) {
      if (revision !== this.semantic_load_revision) return;
      log.error("Failed to load semantic edges", {
        error: error_message(error),
      });
    }
  }

  async toggle_semantic_edges(settings?: {
    max_vault_size?: number;
    knn_limit?: number;
    distance_threshold?: number;
  }): Promise<void> {
    this.graph_store.toggle_show_semantic_edges();
    if (
      this.graph_store.show_semantic_edges &&
      this.graph_store.semantic_edges.length === 0
    ) {
      await this.load_semantic_edges(settings);
    }
  }

  async load_smart_link_edges(settings?: {
    max_vault_size?: number;
    min_score?: number;
    per_note_limit?: number;
  }): Promise<void> {
    const vault_id = this.get_active_vault_id();
    const snapshot = this.graph_store.vault_snapshot;
    if (!vault_id || !snapshot) return;

    const max_size = settings?.max_vault_size ?? SMART_LINK_EDGE_MAX_VAULT_SIZE;

    if (snapshot.stats.node_count > max_size) {
      log.warn("Vault too large for smart link edges", {
        node_count: snapshot.stats.node_count,
        max_size,
      });
      return;
    }

    const revision = ++this.smart_link_load_revision;
    const min_score = settings?.min_score ?? SMART_LINK_EDGE_MIN_SCORE;
    const per_note_limit =
      settings?.per_note_limit ?? SMART_LINK_EDGE_PER_NOTE_LIMIT;

    try {
      const raw_edges = await this.search_port.compute_smart_link_vault_edges(
        vault_id,
        min_score,
        per_note_limit,
      );
      if (revision !== this.smart_link_load_revision) return;

      const edges = raw_edges.map((e) => ({
        source: e.sourcePath,
        target: e.targetPath,
        score: e.score,
        rules: e.rules.map((r) => ({
          rule_id: r.ruleId,
          raw_score: r.rawScore,
        })),
      }));

      log.info("Smart link edges loaded", {
        edges_count: edges.length,
        min_score,
        per_note_limit,
      });

      this.graph_store.set_smart_link_edges(edges);
    } catch (error) {
      if (revision !== this.smart_link_load_revision) return;
      log.error("Failed to load smart link edges", {
        error: error_message(error),
      });
    }
  }

  async toggle_smart_link_edges(settings?: {
    max_vault_size?: number;
    min_score?: number;
    per_note_limit?: number;
  }): Promise<void> {
    this.graph_store.toggle_show_smart_link_edges();
    if (
      this.graph_store.show_smart_link_edges &&
      this.graph_store.smart_link_edges.length === 0
    ) {
      await this.load_smart_link_edges(settings);
    }
  }

  async execute_search_graph(tab_id: string, query: string): Promise<void> {
    if (!this.search_graph_store) return;
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;

    this.search_graph_store.set_loading(tab_id);
    this.search_graph_store.update_query(tab_id, query);

    try {
      const hits = await this.search_port.hybrid_search(vault_id, query, 50);

      let vault_snapshot = this.graph_store.vault_snapshot;
      if (!vault_snapshot) {
        vault_snapshot = await this.graph_port.load_vault_graph(vault_id);
        this.graph_store.set_vault_snapshot(vault_snapshot);
      }

      const subgraph_hits: SearchSubgraphHit[] = hits.map((h) => {
        const hit: SearchSubgraphHit = {
          path: h.note.path,
          title: h.note.title,
          score: h.score,
        };
        if (h.snippet) hit.snippet = h.snippet;
        return hit;
      });

      let semantic_edges: SemanticEdge[] = [];
      let semantic_boost_paths: Set<string> | undefined;
      try {
        const hit_paths = subgraph_hits.map((h) => h.path);
        semantic_edges = await this.search_port.semantic_search_batch(
          vault_id,
          hit_paths,
          SEMANTIC_EDGE_KNN_LIMIT,
          SEMANTIC_EDGE_DISTANCE_THRESHOLD,
        );

        const sem_hits = await this.search_port.semantic_search(
          vault_id,
          query,
          20,
        );
        semantic_boost_paths = new Set(sem_hits.map((h) => h.note.path));
      } catch {
        // Embeddings may not be available — proceed without semantic edges
      }

      const smart_link_edges = this.graph_store.smart_link_edges;
      const snapshot = extract_search_subgraph(
        subgraph_hits,
        vault_snapshot,
        semantic_edges,
        smart_link_edges,
        semantic_boost_paths ? { semantic_boost_paths } : undefined,
      );
      const auto_expanded = compute_auto_expanded_ids(snapshot);
      this.search_graph_store.set_snapshot(tab_id, snapshot, auto_expanded);
    } catch (error) {
      log.error("Failed to execute search graph", {
        error: error_message(error),
      });
      this.search_graph_store.set_error(tab_id, error_message(error));
    }
  }

  select_search_graph_node(tab_id: string, node_id: string | null): void {
    this.search_graph_store?.select_node(tab_id, node_id);
  }

  hover_search_graph_node(tab_id: string, node_id: string | null): void {
    this.search_graph_store?.set_hovered_node(tab_id, node_id);
  }

  toggle_search_graph_user_expanded(tab_id: string, node_id: string): void {
    this.search_graph_store?.toggle_user_expanded(tab_id, node_id);
  }

  async expand_search_graph_node(
    tab_id: string,
    node_path: string,
  ): Promise<void> {
    if (!this.search_graph_store) return;
    const vault_id = this.get_active_vault_id();
    if (!vault_id) return;

    const instance = this.search_graph_store.get_instance(tab_id);
    if (!instance?.snapshot) return;

    try {
      const similar = await this.search_port.find_similar_notes(
        vault_id,
        node_path,
        5,
      );

      let vault_snapshot = this.graph_store.vault_snapshot;
      if (!vault_snapshot) {
        vault_snapshot = await this.graph_port.load_vault_graph(vault_id);
        this.graph_store.set_vault_snapshot(vault_snapshot);
      }

      const new_hits: SearchSubgraphHit[] = similar.map((h) => ({
        path: h.note.path,
        title: h.note.title,
        score: h.distance,
      }));

      const merged = merge_expansion_into_snapshot(
        instance.snapshot,
        new_hits,
        vault_snapshot,
      );
      const auto_expanded = compute_auto_expanded_ids(merged);
      this.search_graph_store.set_snapshot(tab_id, merged, auto_expanded);
    } catch (error) {
      log.error("Failed to expand search graph node", {
        error: error_message(error),
      });
    }
  }
}
