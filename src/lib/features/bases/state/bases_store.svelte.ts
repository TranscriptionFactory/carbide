import type { BaseNoteRow, PropertyInfo, BaseQuery } from "../ports";

export class BasesStore {
  active_view_mode = $state<"table" | "list">("table");
  query = $state<BaseQuery>({
    filters: [],
    sort: [],
    limit: 100,
    offset: 0,
  });
  available_properties = $state<PropertyInfo[]>([]);
  result_set = $state<BaseNoteRow[]>([]);
  total_count = $state(0);
  loading = $state(false);
  error = $state<string | null>(null);

  set_results(results: { rows: BaseNoteRow[]; total: number }) {
    this.result_set = results.rows;
    this.total_count = results.total;
  }
}
