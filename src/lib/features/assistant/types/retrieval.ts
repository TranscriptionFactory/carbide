// AU-040b lands only the readiness half of C3's retrieval contract; AU-040c
// adds RetrievalPort itself alongside it.
//
// Declared here rather than in ports.ts because the stores layer rule bans
// importing anything whose basename is `ports.ts`, and the chat store carries
// readiness as view state. ports.ts imports these the same way it already
// imports AssistantSession from types/session.ts.
export type RetrievalReadiness =
  | { state: "checking" }
  | { state: "indexing"; embedded: number; total: number }
  | { state: "ready" }
  | { state: "unavailable"; reason: string };
