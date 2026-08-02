// C3 (AU-040c) — rag is the index-facing half only. Retrieval says what it
// found and where; everything that turns a retrieval into a turn now lives in
// `assistant`. The DI root adapts this service to the assistant's
// RetrievalPort, so nothing here names the assistant's types.
export { RetrievalService } from "$lib/features/rag/application/retrieval_service";
