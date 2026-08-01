---
"carbide": minor
---

feat(git): discard uncommitted changes

Source control could stage, unstage, commit and restore a past version, but there was no way to throw away a working-tree change — `git_restore_file` auto-committed, which is the wrong semantics for "undo my edits".

- **Discard a single change** from the change card or the diff viewer footer, and **Discard All** from the Changes section.
- A modified file is reset to its committed content, an untracked file is deleted, and a deleted file is restored — **without creating a commit**.
- Conflicted files are refused with a clear error rather than silently resolved, and a batch discard is rejected up front if any file in it is conflicted.
- Every path is behind an explicit confirmation dialog. The headless CLI/MCP route has no dialog, so it rejects the request unless `"confirm": true` is passed.

Discarding the note you have open updates the editor in place, and discarding an untracked open note closes its tab.
