import type { BasesPort } from "$lib/features/bases";
import type { QueryResult } from "$lib/features/query";
import type { BaseQueryOutcome } from "$lib/features/smart_blocks";
import type { NotePath, VaultId } from "$lib/shared/types/ids";

export const BASE_QUERY_ROW_CAP = 1000;

export type BaseQueryDeps = {
  run_query: (text: string) => Promise<QueryResult>;
  bases: BasesPort;
};

function distinct_note_paths(result: QueryResult): NotePath[] {
  return [...new Set(result.items.map((item) => item.note.path))];
}

export async function run_base_query(
  deps: BaseQueryDeps,
  vault_id: VaultId,
  text: string,
): Promise<BaseQueryOutcome> {
  const result = await deps.run_query(text);
  const paths = distinct_note_paths(result);
  const [results, available_properties] = await Promise.all([
    deps.bases.query(vault_id, {
      filters: [],
      sort: [],
      limit: BASE_QUERY_ROW_CAP,
      offset: 0,
    }),
    deps.bases.list_properties(vault_id),
  ]);
  const by_path = new Map(results.rows.map((row) => [row.note.path, row]));
  const rows = paths
    .map((path) => by_path.get(path))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .slice(0, BASE_QUERY_ROW_CAP);
  return { rows, available_properties, total: paths.length };
}
