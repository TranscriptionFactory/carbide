import type { NoteRevision } from "$lib/features/assistant/types/proposal";

// R4's "base note revision". Pure and content-derived: same bytes → same
// revision, on any machine, in any order. Deliberately NOT mtime or a
// git oid — a proposal must survive a no-op save, and must not require the
// note to be committed.
//
// Two independently seeded FNV-1a 32-bit passes, concatenated, rather than
// one: the signature is synchronous (rules out Web Crypto, which is
// async-only), and no hash utility exists elsewhere in the tree. A collision
// here is a false "not stale" that splices a proposal's hunks into content
// that has actually moved, so a single 32-bit hash's collision odds are not
// acceptable — two seeded passes give ~64 bits of effective space.
export function compute_note_revision(content: string): NoteRevision {
  const [a, b] = fnv1a32_pair(content);
  return a.toString(16).padStart(8, "0") + b.toString(16).padStart(8, "0");
}

// Checked at apply (R4), never polled — the layering lint bans `state/` from
// importing `domain/`, so the store structurally cannot call this eagerly.
// Split from the store so both the apply service and the review center can
// ask the question without either owning the answer.
export function is_stale(
  base_revision: NoteRevision,
  current_content: string,
): boolean {
  return compute_note_revision(current_content) !== base_revision;
}

// Both seeded hashes in one pass over `content` rather than two — same
// output, half the character reads.
function fnv1a32_pair(content: string): [number, number] {
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x01000193) >>> 0;
  }
  return [a, b];
}
