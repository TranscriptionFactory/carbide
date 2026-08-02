---
"carbide": minor
---

feat(assistant): AI edits become reviewable proposals behind a single checkpoint

AI used to write to your notes the moment you accepted — each surface with its own
apply path, and no way to see everything the assistant wanted to change in one place.
Every AI note-mutation now flows through one proposal queue.

What changes for you: a **Proposal review center** opens as a workspace tab, grouping
pending changes by the session that produced them. Each proposal shows its hunks, you
toggle the ones you want, and accepting a batch takes **one** git checkpoint before
writing — not one per file, and not none. Reject leaves your notes untouched. The
inline decorations and the panel's diff view are now two renderings of that same
queue rather than two separate ways to write to disk, so what you see in the review
center is exactly what will be applied.

Proposals know what they were computed against. If a note changes after a proposal is
generated, that proposal is flagged **stale** at apply time rather than silently
patching the wrong lines — a note that moved or was deleted is reported back to you as
a decision, not as an error. Proposals are in-memory: restarting clears the queue and
leaves your notes exactly as they were.

If your vault is not a git repository, proposals still apply — Carbide just records
that no checkpoint could be taken, rather than refusing to work or quietly promising
an undo that does not exist.

Two user-visible fixes ride along:

- **Multi-file diffs merged unrelated files together.** Hunk boundaries were detected
  by comparing each new hunk's header against only the *previous* hunk, so two
  different files whose hunks shared a header — two new single-line files both
  reporting `@@ -0,0 +1 @@`, for example — collapsed into one entry with both files'
  content interleaved. Consecutive binary files hit the same bug through a constant
  `[Binary file]` marker. Diff hunks now carry their file path and boundaries are keyed
  on it, so a multi-file diff shows one entry per file.

- **Per-hunk toggles did nothing.** In the review tab, expanding a proposal and
  deselecting a hunk updated only the view; the selection never reached the store that
  apply actually reads. Deselected hunks were applied anyway, silently. The toggle now
  drives the real selection state, so what you deselect is what stays out.
