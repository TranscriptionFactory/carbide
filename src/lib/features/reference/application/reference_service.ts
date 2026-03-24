import type { ReferenceStoragePort } from "../ports";
import type { ReferenceStore } from "../state/reference_store.svelte";
import type { CslItem, ReferenceSource } from "../types";
import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import { match_query } from "../domain/csl_utils";

export class ReferenceService {
  constructor(
    private storage_port: ReferenceStoragePort,
    private store: ReferenceStore,
    private vault_store: VaultStore,
    private op_store: OpStore,
    private now_ms: () => number,
  ) {}

  private require_vault_id(): string {
    const vault = this.vault_store.vault;
    if (!vault) throw new Error("No active vault");
    return vault.id;
  }

  async load_library(): Promise<void> {
    const vault_id = this.require_vault_id();
    const op_key = "reference.load_library";
    this.op_store.start(op_key, this.now_ms());
    this.store.set_loading(true);
    try {
      const library = await this.storage_port.load_library(vault_id);
      this.store.set_library_items(library.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    } finally {
      this.store.set_loading(false);
    }
  }

  async add_reference(item: CslItem, _source: ReferenceSource): Promise<void> {
    const vault_id = this.require_vault_id();
    const op_key = "reference.add";
    this.op_store.start(op_key, this.now_ms());
    try {
      const library = await this.storage_port.add_item(vault_id, item);
      this.store.set_library_items(library.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    }
  }

  async remove_reference(citekey: string): Promise<void> {
    const vault_id = this.require_vault_id();
    const op_key = "reference.remove";
    this.op_store.start(op_key, this.now_ms());
    try {
      const library = await this.storage_port.remove_item(vault_id, citekey);
      this.store.set_library_items(library.items);
      this.store.set_error(null);
      this.op_store.succeed(op_key);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.store.set_error(msg);
      this.op_store.fail(op_key, msg);
    }
  }

  search_library(query: string): CslItem[] {
    if (!query.trim()) {
      this.store.set_search_results([]);
      return [];
    }
    const results = this.store.library_items.filter((item) =>
      match_query(item, query),
    );
    this.store.set_search_results(results);
    return results;
  }
}
