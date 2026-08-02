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

// R5's deterministic producers. The plan named three; TWO of those three are
// unbuildable as written, and the reasons are load-bearing.
//
// - `stale_link` is the plan's "stale links": an outlink in the note whose
//   target does not exist. Already computable — SearchPort's note-links
//   snapshot returns exactly this set from SQLite, per note, with no new Rust.
//
// - `orphan_note` is a note with ZERO INBOUND links. Note the collision:
//   everywhere else in this codebase `orphan_links` / `orphan_count` /
//   graph node kind "orphan" mean a BROKEN OUTLINK — the opposite direction.
//   Crucially this needs NO vault graph: `backlinks` ships in the very same
//   `NoteLinksSnapshot` that `stale_link` reads, so both producers come from
//   ONE per-note indexed query (`index_note_links_snapshot` returns backlinks,
//   outlinks, orphan_links and attachments together). Fires only when
//   `backlinks` is empty AND `outlinks` is not — a brand-new or unindexed note
//   has neither, so the guard suppresses that false-positive class too.
//
// - The plan's "renamed links" HAS NO PRODUCER AND IS DROPPED. In-app rename
//   rewrites every backlinking file in Rust before a reactor could observe rot,
//   folder rename repairs in TS, and external renames emit no rename event.
//   A first attempt to re-scope it onto "the repair that did not land" also
//   failed on inspection: `LinkRepairResult.failed` is folded into a COUNT
//   before it leaves the stack (`on_failed(build_link_repair_failed_message(
//   result.failed.length))`, and `OpStore.fail` stores only a string), so the
//   paths are discarded and no notice can carry a `note_path`. The dirty-buffer
//   skip is separately not a failure at all — it returns `{status:"rewritten"}`,
//   i.e. the buffer holds the fix and disk does not. That state is *unpersisted*,
//   not unrepaired. Reviving this producer requires widening the repair API to
//   retain paths, which is cross-feature work C3 has not authorised.
export type AmbientNoticeKind = "stale_link" | "orphan_note";

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
// Instead the anchor is re-resolved at render time from the note's text.
// Notices are in-memory and session-scoped, so nothing has to survive a reopen.
//
// AMENDED after AU-061's phase 1, which caught two errors in this comment's
// first draft:
//
// (1) `match` is the text AS RENDERED IN THE DOCUMENT, not the source markdown.
//     The wiki-link plugin REPLACES the literal `[[target]]` with a link-marked
//     text node whose text is `format_wiki_target_display(target)`, so an anchor
//     carrying `"[[fusion-weights]]"` matches nothing in the visual editor.
//     **Producers must convert before emitting.** (Consequence, accepted and
//     named: in source mode the raw `[[...]]` is the document text, so such an
//     anchor degrades to note-level there — source mode is out of scope for v1.)
//
// (2) The diagnostics plugin is NOT the precedent for re-resolution. It MAPS
//     its decorations through `tr.mapping` on `docChanged` and only re-resolves
//     when a new set is pushed from outside. Mapping is wrong here: a text
//     anchor whose text was edited away must STOP resolving, and a mapped range
//     would survive as a stale highlight. The correct precedent is
//     `find_highlight_plugin`, which recomputes on every doc change.
//
// An anchor that no longer resolves degrades to note-level. It never throws and
// never silently drops the notice.
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
