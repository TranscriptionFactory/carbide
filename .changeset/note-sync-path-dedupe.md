---
"carbide": patch
---

Accepting several proposals that touch the same note now reloads that note once

The post-write reconciliation walked its path list as given. A batch that
applied two proposals against one file listed that file twice, so the open
buffer was closed and force-reloaded twice in a row — duplicate work, not wrong
work, but the second round trip re-read disk and reset the editor for a note
that was already current.

The path list is deduplicated before the walk, keeping first-seen order.
