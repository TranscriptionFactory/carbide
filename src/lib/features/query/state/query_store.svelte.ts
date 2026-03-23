import type { QueryResult, QueryError } from "../types";

export type QueryStatus = "idle" | "running" | "done" | "error";

export class QueryStore {
  query_text = $state("");
  result: QueryResult | null = $state(null);
  error: QueryError | null = $state(null);
  status: QueryStatus = $state("idle");
  history: string[] = $state([]);

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
  }

  private push_history(text: string) {
    if (!text) return;
    this.history = [text, ...this.history.filter((h) => h !== text)].slice(
      0,
      20,
    );
  }
}
