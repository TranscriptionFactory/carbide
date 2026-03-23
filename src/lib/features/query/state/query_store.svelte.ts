import type { QueryResult, QueryError, SavedQueryMeta } from "../types";

export type QueryStatus = "idle" | "running" | "done" | "error";

export class QueryStore {
  query_text = $state("");
  result: QueryResult | null = $state(null);
  error: QueryError | null = $state(null);
  status: QueryStatus = $state("idle");
  history: string[] = $state([]);

  saved_queries: SavedQueryMeta[] = $state([]);
  active_saved_path: string | null = $state(null);

  set_running(query_text: string) {
    this.query_text = query_text;
    this.status = "running";
    this.error = null;
  }

  set_result(result: QueryResult) {
    this.result = result;
    this.status = "done";
    this.error = null;
    this.push_history(result.query_text);
  }

  set_error(error: QueryError) {
    this.error = error;
    this.status = "error";
    this.result = null;
  }

  clear() {
    this.query_text = "";
    this.result = null;
    this.error = null;
    this.status = "idle";
    this.active_saved_path = null;
  }

  set_saved_queries(queries: SavedQueryMeta[]) {
    this.saved_queries = queries;
  }

  add_saved_query(query: SavedQueryMeta) {
    this.saved_queries = [
      query,
      ...this.saved_queries.filter((q) => q.path !== query.path),
    ];
  }

  remove_saved_query(path: string) {
    this.saved_queries = this.saved_queries.filter((q) => q.path !== path);
    if (this.active_saved_path === path) {
      this.active_saved_path = null;
    }
  }

  private push_history(text: string) {
    if (!text) return;
    this.history = [text, ...this.history.filter((h) => h !== text)].slice(
      0,
      20,
    );
  }
}
