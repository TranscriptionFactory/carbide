import type { AssistantSessionPersistencePort } from "$lib/features/assistant";

// Chat sessions are assistant sessions (I4), so rag persists through the one
// assistant contract rather than a parallel port of the same shape.
export type RagPersistencePort = AssistantSessionPersistencePort;
