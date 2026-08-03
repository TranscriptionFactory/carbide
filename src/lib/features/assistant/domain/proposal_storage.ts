import type {
  Proposal,
  ProposalTarget,
} from "$lib/features/assistant/types/proposal";

// Persisted format for the pending proposal queue (I8 as amended
// 2026-08-03). One file per vault: proposal ids contain `:`/`/`/`#`
// (agent-turn ids embed run id, timestamp and note path), so the session
// adapter's SAFE_ID per-file scheme cannot hold them.
export const PROPOSAL_STORAGE_VERSION = 1;

// Pending-only is self-limiting in practice; the cap is a backstop against a
// runaway producer. Newest first, enforced on write AND read so a file from
// a version without the cap cannot flood the store.
export const PROPOSAL_STORAGE_CAP = 500;

export type StoredProposals = {
  version: number;
  saved_at: number;
  proposals: unknown[];
};

export function to_stored(
  proposals: readonly Proposal[],
  saved_at: number,
): StoredProposals {
  const pending = proposals
    .filter((proposal) => proposal.status === "pending")
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, PROPOSAL_STORAGE_CAP);
  return {
    version: PROPOSAL_STORAGE_VERSION,
    saved_at,
    proposals: pending,
  };
}

// Non-throwing by contract: a corrupt file degrades to an empty queue, and a
// single invalid entry drops alone rather than taking the file with it.
// version > 1 is still read — refusing would let a downgrade destroy the
// queue — and unknown fields written by a newer version survive the
// round-trip because entries are validated in place, never rebuilt.
export function parse_stored(raw: unknown): Proposal[] {
  if (!is_record(raw)) return [];
  if (typeof raw.version !== "number" || raw.version < 1) return [];
  if (!Array.isArray(raw.proposals)) return [];

  const parsed: Proposal[] = [];
  for (const entry of raw.proposals) {
    const proposal = parse_entry(entry);
    if (proposal) parsed.push(proposal);
    if (parsed.length === PROPOSAL_STORAGE_CAP) break;
  }
  return parsed;
}

function parse_entry(raw: unknown): Proposal | null {
  if (!is_record(raw)) return null;
  // Terminal statuses are never written; a file that carries one anyway
  // (hand-edited, or a future format change) must not resurrect it.
  if (raw.status !== "pending") return null;
  if (typeof raw.id !== "string" || raw.id.length === 0) return null;
  if (typeof raw.base_revision !== "string") return null;
  if (typeof raw.created_at !== "number") return null;
  if (!parse_target(raw.target)) return null;
  if (!is_record(raw.origin)) return null;
  if (typeof raw.origin.session_id !== "string") return null;
  const run_id = raw.origin.run_id ?? null;
  if (run_id !== null && typeof run_id !== "string") return null;
  if (!valid_hunks(raw.hunks)) return null;

  return raw as Proposal;
}

function parse_target(raw: unknown): ProposalTarget | null {
  if (!is_record(raw)) return null;
  if (raw.kind === "note" && typeof raw.note_path === "string") {
    return raw as ProposalTarget;
  }
  if (raw.kind === "document" && typeof raw.file_path === "string") {
    return raw as ProposalTarget;
  }
  return null;
}

function valid_hunks(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const hunk of raw) {
    if (!is_record(hunk)) return false;
    if (typeof hunk.id !== "string") return false;
    if (typeof hunk.header !== "string") return false;
    if (typeof hunk.selected !== "boolean") return false;
    if (!valid_lines(hunk.lines)) return false;
  }
  return true;
}

const LINE_KINDS = new Set(["context", "add", "del"]);

function valid_lines(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false;
  for (const line of raw) {
    if (!is_record(line)) return false;
    if (typeof line.kind !== "string" || !LINE_KINDS.has(line.kind)) {
      return false;
    }
    if (typeof line.content !== "string") return false;
    if (line.old_line !== null && typeof line.old_line !== "number") {
      return false;
    }
    if (line.new_line !== null && typeof line.new_line !== "number") {
      return false;
    }
  }
  return true;
}

function is_record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
