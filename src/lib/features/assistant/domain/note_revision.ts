import type { NoteRevision } from "$lib/features/assistant/types/proposal";

const NOT_IMPLEMENTED =
  "NOT_IMPLEMENTED: AU-030 implements note revisions + staleness";

// R4's "base note revision". Pure and content-derived: same bytes → same
// revision, on any machine, in any order. Deliberately NOT mtime or a
// git oid — a proposal must survive a no-op save, and must not require the
// note to be committed.
export function compute_note_revision(_content: string): NoteRevision {
  throw new Error(NOT_IMPLEMENTED);
}

// Checked at apply (R4), never polled. Split from the store so both the apply
// service and the review center can ask the question without either owning
// the answer.
export function is_stale(
  _base_revision: NoteRevision,
  _current_content: string,
): boolean {
  throw new Error(NOT_IMPLEMENTED);
}
