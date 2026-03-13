import type { VaultId } from "$lib/shared/types/ids";
import type { BasesPort, BaseQuery } from "../ports";
import type { BasesStore } from "../state/bases_store.svelte";

export class BasesService {
  constructor(
    private port: BasesPort,
    private store: BasesStore,
  ) {}

  async refresh_properties(vault_id: VaultId) {
    try {
      const props = await this.port.list_properties(vault_id);
      this.store.available_properties = props;
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async run_query(vault_id: VaultId, query?: BaseQuery) {
    const q = query ?? this.store.query;
    this.store.loading = true;
    this.store.error = null;
    try {
      const results = await this.port.query(vault_id, q);
      this.store.set_results(results);
    } catch (e) {
      this.store.error = String(e);
    } finally {
      this.store.loading = false;
    }
  }

  async save_view(vault_id: VaultId, path: string, name: string) {
    const view = {
      name,
      query: this.store.query,
      view_mode: this.store.active_view_mode,
    };
    try {
      await this.port.save_view(vault_id, path, view);
    } catch (e) {
      this.store.error = String(e);
    }
  }

  async load_view(vault_id: VaultId, path: string) {
    this.store.loading = true;
    try {
      const view = await this.port.load_view(vault_id, path);
      this.store.query = view.query;
      this.store.active_view_mode = view.view_mode as "table" | "list";
      await this.run_query(vault_id);
    } catch (e) {
      this.store.error = String(e);
    } finally {
      this.store.loading = false;
    }
  }
}
