export type RagReadiness =
  | { state: "checking" }
  | { state: "indexing"; embedded: number; total: number }
  | { state: "ready" };
