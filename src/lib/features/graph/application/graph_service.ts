import type { EditorStore } from "$lib/features/editor";
import type { GraphPort } from "$lib/features/graph/ports";
import type { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import {
  build_semantic_edges,
  SEMANTIC_EDGE_KNN_LIMIT,
  SEMANTIC_EDGE_MAX_VAULT_SIZE,
} from "$lib/features/graph/domain/semantic_edges";
import type { SearchPort } from "$lib/features/search";
import type { VaultStore } from "$lib/features/vault";
import type { SemanticSearchHit } from "$lib/shared/types/search";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("graph_service");

export class GraphService {
  private vault_load_revision = 0;
  private semantic_load_revision = 0;

  constructor(
    private readonly graph_port: GraphPort,
    private readonly search_port: SearchPort,
    private readonly vault_store: VaultStore,
    private readonly editor_store: EditorStore,
    private readonly graph_store: GraphStore,
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

    this.graph_store.set_panel_open(true);
    this.graph_store.start_loading(note_path);

    try {
      const snapshot = await this.graph_port.load_note_neighborhood(
        vault_id,
        note_path,
      );
      this.graph_store.set_snapshot(snapshot);
    } catch (error) {
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

    try {
      const snapshot = await this.graph_port.load_vault_graph(vault_id);
      if (revision !== this.vault_load_revision) return;
      this.graph_store.set_vault_snapshot(snapshot);
    } catch (error) {
      if (revision !== this.vault_load_revision) return;
      const message = error_message(error);
      log.error("Load vault graph failed", { error: message });
      this.graph_store.set_error("vault", message);
    }
  }

  async toggle_view_mode(): Promise<void> {
    const current = this.graph_store.view_mode;
    if (current === "neighborhood") {
      this.graph_store.set_view_mode("vault");
      await this.load_vault_graph();
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

  async load_semantic_edges(): Promise<void> {
    const vault_id = this.get_active_vault_id();
    const snapshot = this.graph_store.vault_snapshot;
    if (!vault_id || !snapshot) return;

    if (snapshot.stats.node_count > SEMANTIC_EDGE_MAX_VAULT_SIZE) {
      log.warn("Vault too large for semantic edges", {
        node_count: snapshot.stats.node_count,
      });
      return;
    }

    const revision = ++this.semantic_load_revision;

    const tasks = snapshot.nodes.map((node) =>
      this.search_port
        .find_similar_notes(vault_id, node.path, SEMANTIC_EDGE_KNN_LIMIT, true)
        .then((hits): [string, SemanticSearchHit[]] => [node.path, hits])
        .catch((): [string, SemanticSearchHit[]] => [node.path, []]),
    );

    const settled = await Promise.allSettled(tasks);
    if (revision !== this.semantic_load_revision) return;

    const results = new Map<string, SemanticSearchHit[]>();
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [path, hits] = result.value;
        results.set(path, hits);
      }
    }

    const edges = build_semantic_edges(results);
    this.graph_store.set_semantic_edges(edges);
  }

  async toggle_semantic_edges(): Promise<void> {
    this.graph_store.toggle_show_semantic_edges();
    if (
      this.graph_store.show_semantic_edges &&
      this.graph_store.semantic_edges.length === 0
    ) {
      await this.load_semantic_edges();
    }
  }
}
