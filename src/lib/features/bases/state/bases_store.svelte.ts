import type {
  BaseFilter,
  BaseNoteRow,
  BaseQuery,
  BaseSort,
  PropertyInfo,
} from "../ports";

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

  add_filter(filter: BaseFilter) {
    this.query = {
      ...this.query,
      filters: [...this.query.filters, filter],
      offset: 0,
    };
  }

  remove_filter(index: number) {
    const filters = this.query.filters.filter((_, i) => i !== index);
    this.query = { ...this.query, filters, offset: 0 };
  }

  clear_filters() {
    this.query = { ...this.query, filters: [], offset: 0 };
  }

  set_sort(sort: BaseSort | null) {
    this.query = { ...this.query, sort: sort ? [sort] : [], offset: 0 };
  }
}
