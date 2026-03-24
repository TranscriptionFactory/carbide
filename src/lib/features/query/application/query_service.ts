import type { VaultStore } from "$lib/features/vault";
import type { OpStore } from "$lib/app/orchestration/op_store.svelte";
import type { QueryBackends } from "../domain/query_solver";
import type { SavedQueryPort } from "../ports";
import { parse_query } from "../domain/query_parser";
import { solve_query } from "../domain/query_solver";
import {
  query_path_from_name,
  validate_query_name,
} from "../domain/saved_query";
import type { QueryStore } from "../state/query_store.svelte";

export const QUERY_OP_KEYS = {
  save: "query.save",
  delete: "query.delete_saved",
} as const;

export class QueryService {
  constructor(
    private readonly backends: QueryBackends,
    private readonly store: QueryStore,
    private readonly vault_store: VaultStore,
    private readonly saved_query_port: SavedQueryPort,
    private readonly op_store: OpStore,
  ) {}

  async execute(query_text: string): Promise<void> {
    const vault = this.vault_store.vault;
    if (!vault) return;

    const trimmed = query_text.trim();
    if (!trimmed) {
      this.store.clear();
      return;
    }

    this.store.set_running(trimmed);

    const parsed = parse_query(trimmed);
    if (!parsed.ok) {
      this.store.set_error(parsed.error);
      return;
    }

    try {
      const result = await solve_query(vault.id, parsed.query, this.backends);
      result.query_text = trimmed;
      this.store.set_result(result);
    } catch (e) {
      this.store.set_error({
        message: e instanceof Error ? e.message : "Query execution failed",
        position: 0,
        length: 0,
      });
    }
  }

  clear(): void {
    this.store.clear();
  }

  async list_saved(): Promise<void> {
    const vault = this.vault_store.vault;
    if (!vault) return;

    try {
      const queries = await this.saved_query_port.list(vault.id);
      this.store.set_saved_queries(queries);
    } catch {
      this.store.set_saved_queries([]);
    }
  }

  async save(name: string): Promise<void> {
    const vault = this.vault_store.vault;
    if (!vault) {
      this.op_store.fail(QUERY_OP_KEYS.save, "No vault open");
      return;
    }

    const validation = validate_query_name(name);
    if (!validation.valid) {
      this.op_store.fail(QUERY_OP_KEYS.save, validation.reason);
      return;
    }

    const query_text = this.store.query_text.trim();
    if (!query_text) {
      this.op_store.fail(QUERY_OP_KEYS.save, "No query to save");
      return;
    }

    this.op_store.start(QUERY_OP_KEYS.save, Date.now());
    const path = query_path_from_name(name.trim());
    try {
      await this.saved_query_port.write(vault.id, path, query_text);
      await this.list_saved();
      this.store.active_saved_path = path;
      this.op_store.succeed(QUERY_OP_KEYS.save);
    } catch (e) {
      this.op_store.fail(
        QUERY_OP_KEYS.save,
        e instanceof Error ? e.message : "Failed to save query",
      );
    }
  }

  reset_save_op(): void {
    this.op_store.reset(QUERY_OP_KEYS.save);
  }

  async load(path: string): Promise<void> {
    const vault = this.vault_store.vault;
    if (!vault) return;

    try {
      const content = await this.saved_query_port.read(vault.id, path);
      this.store.query_text = content.trim();
      this.store.active_saved_path = path;
      await this.execute(this.store.query_text);
    } catch (e) {
      this.store.set_error({
        message: e instanceof Error ? e.message : "Failed to load query",
        position: 0,
        length: 0,
      });
    }
  }

  async delete_saved(path: string): Promise<void> {
    const vault = this.vault_store.vault;
    if (!vault) return;

    try {
      await this.saved_query_port.remove(vault.id, path);
      this.store.remove_saved_query(path);
    } catch (e) {
      this.op_store.fail(
        QUERY_OP_KEYS.delete,
        e instanceof Error ? e.message : "Failed to delete query",
      );
    }
  }
}
