import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai";
import type { RunEvent, RunRequest } from "$lib/features/assistant/types/run";
import type { PermissionOptionKind } from "$lib/features/assistant/types/agent_events";
import type {
  AssistantSession,
  AssistantSessionSummary,
} from "$lib/features/assistant/types/session";
import type {
  RetrievalOutcome,
  RetrievalReadiness,
  RetrievalRequest,
} from "$lib/features/assistant/types/retrieval";

export type TransportRequest = {
  provider_config: AiProviderConfig;
  request: RunRequest;
  vault_path: string | null;
  signal?: AbortSignal;
};

export type PermissionResponse =
  | { option_id: string; kind: PermissionOptionKind }
  | { kind: "cancelled" };

// Answers a parked per-tool-call permission prompt on the backend engine.
export interface AssistantPermissionPort {
  respond(request_id: string, response: PermissionResponse): Promise<void>;
}

// One transport for every assistant execution. Both wire channels the app used
// to have (`ai:chunk:*` text streaming and `agent-run-event:*` agent turns) are
// parameterizations of this single contract; the mode on RunRequest selects.
export interface AssistantTransportPort {
  stream(input: TransportRequest): AsyncIterable<RunEvent>;
}

export interface AssistantProviderProbePort {
  detect_status(config: AiProviderConfig): Promise<AiCliProbeStatus>;
}

// C1 contract: per-session files (I8 — the only persisted-format change of the
// program happens this cycle). Same shape as rag's RagPersistencePort so
// AU-014's adapter and hydration reactor are a port swap, not a redesign;
// list/load split keeps hydration lazy for large vaults.
export interface AssistantSessionPersistencePort {
  list_sessions(vault_id: string): Promise<AssistantSessionSummary[]>;
  load_session(vault_id: string, id: string): Promise<AssistantSession | null>;
  save_session(vault_id: string, session: AssistantSession): Promise<void>;
  delete_session(vault_id: string, id: string): Promise<void>;
}

// I8 as amended 2026-08-03: pending proposals persist per vault. The port
// carries raw JSON values in both directions — parsing and validation are
// domain logic (proposal_storage.ts), so the adapter stays a dumb file pipe
// like the session adapter beside it.
export interface ProposalPersistencePort {
  load_proposals(vault_id: string): Promise<unknown>;
  save_proposals(vault_id: string, stored: unknown): Promise<void>;
}

// C3 contract. Retrieval says what it found and where; generation says how much
// of it to spend. Declared structurally so `rag` never names this type: the
// DI root builds an object literal over the retrieval service, the same way it
// already does for ProposalCheckpointPort. An `implements` clause here would
// force rag to import from `$lib/features/assistant`, which is the edge this
// cycle exists to remove.
export interface RetrievalPort {
  retrieve(request: RetrievalRequest): Promise<RetrievalOutcome>;
  check_readiness(): Promise<RetrievalReadiness>;
}

// C2 contract. Both ports are declared structurally rather than imported from
// `note`/`git` — the assistant slice must stay free of feature imports so C3's
// exit-gate greps never grow, and `agent_runner.ts:18` already sets the
// precedent of a runner declaring its own narrow checkpoint interface.

// `unavailable` is not an error: git is optional in a Carbide vault, and
// GitService.create_checkpoint *resolves* with no_repo/skipped/failed rather
// than throwing — so a Promise<void> port would erase the difference between
// "undo exists" and "we silently rewrote notes with no way back". I5 says
// mutations flow BEHIND a checkpoint; the apply service cannot honour that
// against a port that cannot say whether one happened (D2-2).
export type ProposalCheckpointOutcome =
  | "created"
  | "skipped"
  | "unavailable"
  | "failed";

// The checkpoint is the undo unit behind every proposal apply (I5). Backed by
// GitService.create_checkpoint, which commits and tags.
export interface ProposalCheckpointPort {
  create_checkpoint(description: string): Promise<ProposalCheckpointOutcome>;
}

// Reading is not a convenience: apply must re-read the note to evaluate
// staleness against the proposal's base revision (R4) immediately before
// writing it. Returns null when the note is gone — a proposal over a deleted
// note is stale, not failed.
export interface ProposalNotePort {
  read_note(note_path: string): Promise<string | null>;
  write_note(note_path: string, content: string): Promise<void>;
}

// Pin 5 (edit the open tab). Structural — no import from the document
// feature; the DI root is where the two meet. The path resolves an OPEN document
// tab's buffer, not disk: apply STAGES into the buffer (stage_document sets
// edited content and marks the tab dirty) and save-the-tab is what writes.
export type AssistantEditTarget = {
  path: string;
  title: string;
  content: string;
};

export interface AssistantDocumentPort {
  // null when the tab is gone or the type is not editable — the caller
  // treats that as stale, mirroring the deleted-note rule.
  read_document(path: string): AssistantEditTarget | null;
  // false when staging failed (tab closed between read and stage).
  stage_document(path: string, content: string): boolean;
}
