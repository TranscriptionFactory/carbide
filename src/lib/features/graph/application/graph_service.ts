import type { EditorStore } from "$lib/features/editor";
import type { GraphPort } from "$lib/features/graph/ports";
import type { GraphStore } from "$lib/features/graph/state/graph_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import { error_message } from "$lib/shared/utils/error_message";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("graph_service");

export class GraphService {
  constructor(
    private readonly graph_port: GraphPort,
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

  async refresh_current(): Promise<void> {
    const note_path = this.graph_store.center_note_path;
    if (!note_path) {
      return;
    }

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
}
