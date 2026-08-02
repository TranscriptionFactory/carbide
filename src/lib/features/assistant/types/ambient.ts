// C3 contracts — frozen for the cycle (E1). A lane needing a change files it
// to the orchestrator instead of editing.
//
// I6: ambient is OPT-IN and OFFER-ONLY. Nothing in this file may mutate a
// note, and nothing produced from it reaches disk without two explicit user
// acts: accepting the notice (which produces a Proposal) and then accepting
// that proposal in the review center. A notice is a suggestion, never an edit.
//
// I8/R4: notices are IN-MEMORY ONLY, like proposals. There is no persistence
// port here and there must not be one. A restart clears the queue.

import type { ProposalOrigin } from "$lib/features/assistant/types/proposal";

export type AmbientNoticeId = string;

// The three deterministic producers of R5. Two were renamed against the plan's
// wording after C3 recon read the source, and the reasons are load-bearing:
//
// - `stale_link` is the plan's "stale links": an outlink in the note whose
//   target does not exist. Already computable — SearchPort's note-links
//   snapshot returns exactly this set from SQLite, per note, with no new Rust.
//
// - `unrepaired_link` REPLACES the plan's "renamed links", which as written is
//   a producer with no input. In-app note rename rewrites every backlinking
//   file in Rust before any reactor could observe rot, folder rename repairs in
//   TS, and EXTERNAL renames emit no rename event at all (VaultFsEvent carries
//   only note_added/note_removed, with no correlation). The real, deterministic
//   signal is the repair that was attempted and did not land: LinkRepairResult
//   .failed, plus the links link_repair_service skips because the buffer was
//   dirty at the time. Same user-facing intent, an input that actually fires.
//
// - `orphan_note` means a note with ZERO INBOUND links. Note the collision:
//   everywhere else in this codebase `orphan_links` / `orphan_count` /
//   graph node kind "orphan" mean a BROKEN OUTLINK — the opposite direction.
//   This is new detection, not a wrapper over the existing concept.
export type AmbientNoticeKind =
  | "stale_link"
  | "unrepaired_link"
  | "orphan_note";

// Where a notice points inside a note.
//
// Deliberately NOT a block id. `ensure_block_id_at` dispatches a transaction
// that writes " ^abc123" into the note, so anchoring by block id would make the
// rail edit the user's prose in order to render itself — I6 inverted, and a
// direct contradiction of the mockup's own "nothing here generates text into
// the note unasked".
//
// Deliberately NOT a positional offset either: that breaks on any insert above
// the block, and the tree's `BlockAnchor` is a cursor-restoration device, not
// an anchoring mechanism.
//
// Instead the anchor is re-resolved at render time from the note's text, the
// way a Diagnostic is re-resolved from line/column on every rebuild. Notices
// are in-memory and session-scoped, so nothing has to survive a reopen.
export type AmbientAnchor =
  | { kind: "note" }
  | { kind: "text"; match: string; occurrence: number };

// The card's one primary offer (mockup: one primary button, one ghost button,
// and every ghost is dismissive). Dismiss is implicit on every notice and is
// NOT expressible here — that is what makes "offer-only" checkable: a notice
// can decline, and it can propose, and it has no third verb.
//
// `action_id` is dispatched through the action registry. Its handler performs
// the IO and enqueues a Proposal; the notice itself stays inert data.
export type AmbientNoticeOffer = {
  action_id: string;
  label: string;
};

export type AmbientNotice = {
  id: AmbientNoticeId;
  kind: AmbientNoticeKind;
  note_path: string;
  anchor: AmbientAnchor;
  // The card's uppercase provenance line, e.g. "ambient · link check".
  provenance: string;
  // One sentence. The mockup's cards state the finding and end in an offer.
  body: string;
  offer: AmbientNoticeOffer;
  created_at: number;
};

// Ambient findings are not born of a kernel run, which is why ProposalOrigin
// .run_id was made nullable in C2. But `session_id` is non-nullable, and an
// ambient producer has no session — so all ambient proposals share this one
// synthetic id. It exists in the contract rather than in each producer so
// AU-060 and AU-061 cannot mint different ones and split the review center's
// provenance group in half.
export const AMBIENT_SESSION_ID = "ambient";

export const AMBIENT_PROPOSAL_ORIGIN: ProposalOrigin = {
  session_id: AMBIENT_SESSION_ID,
  run_id: null,
};

// The mockup specifies "cards cap at 2–3 visible" — a RANGE, not a number, and
// it mocks no overflow affordance beyond the prose "collapses into the margin
// count". Fixed here at 3 rather than left to the lane: 3 is the house
// precedent for a visible cap (bases_calendar's MAX_VISIBLE_NOTES) and matches
// sonner's own default. Overflow renders as a "+N" count, per the same
// precedent.
export const AMBIENT_RAIL_CARD_CAP = 3;

// "Toast budget" is a plan-level term with NO upstream number — neither mockup
// nor the source-of-truth doc specifies a rate, cadence, or concurrency. It is
// defined here so it is verifiable at all.
//
// The house precedent is ConflictToastManager: a max-one singleton that dedups
// by key and dismisses its predecessor before showing a replacement. Note that
// sonner's own `visibleToasts` is a RENDER cap that queues the excess and
// drains it one by one — relying on it would let an ambient burst arrive
// serially, which is precisely the interruption the rail exists to avoid. The
// budget must therefore be enforced BEFORE toast() is called.
export const AMBIENT_TOAST_MAX_CONCURRENT = 1;
export const AMBIENT_TOAST_DEDUPE_KEY = "note_path" as const;
