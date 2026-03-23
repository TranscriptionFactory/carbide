import type { VaultStore } from "$lib/features/vault";
import type { QueryBackends } from "../domain/query_solver";
import { parse_query } from "../domain/query_parser";
import { solve_query } from "../domain/query_solver";
import type { QueryStore } from "../state/query_store.svelte";

export class QueryService {
  constructor(
    private readonly backends: QueryBackends,
    private readonly store: QueryStore,
    private readonly vault_store: VaultStore,
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
}
