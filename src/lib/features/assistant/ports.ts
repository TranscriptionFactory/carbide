import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai";
import type { RunEvent, RunRequest } from "$lib/features/assistant/types/run";
import type {
  AssistantSession,
  AssistantSessionSummary,
} from "$lib/features/assistant/types/session";

export type TransportRequest = {
  provider_config: AiProviderConfig;
  request: RunRequest;
  vault_path: string | null;
  signal?: AbortSignal;
};

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
