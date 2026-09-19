export type RagReadiness =
  | { state: "checking" }
  | { state: "indexing"; embedded: number; total: number }
  // Coverage the pass cannot finish: it ended with eligible notes still without
  // a vector (unembeddable content, a failed encode). Terminal until some later
  // attempt changes the numbers.
  | { state: "partial"; embedded: number; total: number; skipped: number }
  | { state: "ready" }
  | { state: "unavailable"; reason: string };
