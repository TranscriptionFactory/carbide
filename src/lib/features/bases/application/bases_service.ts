import type { VaultId } from "$lib/shared/types/ids";
import type {
  BaseQuery,
  BasesPort,
  BaseViewDefinition,
  ViewMode,
} from "../ports";
import type { BasesStore } from "../state/bases_store.svelte";

export class BasesService {
  private active_revision = 0;

  constructor(
    private port: BasesPort,
    private store: BasesStore,
  ) {}

  async refresh_properties(vault_id: VaultId) {
    const revision = ++this.active_revision;
    try {
      const props = await this.port.list_properties(vault_id);
      if (revision !== this.active_revision) return;
      this.store.available_properties = props;
    } catch (e) {
      if (revision !== this.active_revision) return;
      this.store.error = String(e);
    }
  }

  async run_query(vault_id: VaultId, query?: BaseQuery) {
    const q = query ?? this.store.query;
    const revision = ++this.active_revision;
    this.store.loading = true;
    this.store.error = null;
    try {
      const results = await this.port.query(vault_id, q);
      if (revision !== this.active_revision) return;
      this.store.set_results(results);
    } catch (e) {
      if (revision !== this.active_revision) return;
      this.store.error = String(e);
    } finally {
      if (revision === this.active_revision) {
        this.store.loading = false;
      }
    }
  }

  async save_view(vault_id: VaultId, path: string, name: string) {
    const view: BaseViewDefinition = {
      name,
      query: this.store.query,
      view_mode: this.store.active_view_mode,
    };
    if (this.store.kanban_config) view.kanban_config = this.store.kanban_config;
    if (this.store.calendar_config)
      view.calendar_config = this.store.calendar_config;
    if (this.store.tree_config) view.tree_config = this.store.tree_config;
    try {
      await this.port.save_view(vault_id, path, view);
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async load_view(vault_id: VaultId, path: string) {
    const revision = ++this.active_revision;
    this.store.loading = true;
    try {
      const view = await this.port.load_view(vault_id, path);
      if (revision !== this.active_revision) return;
      this.store.query = view.query;
      this.store.active_view_mode = view.view_mode as ViewMode;
      this.store.kanban_config = view.kanban_config ?? null;
      this.store.calendar_config = view.calendar_config ?? null;
      this.store.tree_config = view.tree_config ?? null;
      this.store.active_view_name = view.name;
      await this.run_query(vault_id);
    } catch (e) {
      if (revision !== this.active_revision) return;
      this.store.error = String(e);
    } finally {
      if (revision === this.active_revision) {
        this.store.loading = false;
      }
    }
  }

  async list_views(vault_id: VaultId) {
    const revision = ++this.active_revision;
    try {
      const views = await this.port.list_views(vault_id);
      if (revision !== this.active_revision) return;
      this.store.saved_views = views;
    } catch (e) {
      if (revision !== this.active_revision) return;
      this.store.error = String(e);
    }
  }

  async delete_view(vault_id: VaultId, path: string) {
    try {
      await this.port.delete_view(vault_id, path);
      this.store.saved_views = this.store.saved_views.filter(
        (v) => v.path !== path,
      );
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async update_property(
    vault_id: VaultId,
    note_path: string,
    key: string,
    value: string,
  ) {
    try {
      await this.port.update_property(vault_id, note_path, key, value);
      await this.run_query(vault_id);
    } catch (e) {
      this.store.error = String(e);
    }
  }
}
