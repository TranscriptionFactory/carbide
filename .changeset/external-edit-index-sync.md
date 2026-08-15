---
"carbide": patch
---

Show notes edited outside Carbide in search results

Notes edited outside Carbide — by git, a sync tool, an agent, or another editor
— now show up in search and in query blocks. Previously their old text kept
being returned until you reopened the vault or opened the omnibar.

Carbide watched for those edits and did the right thing in the editor: an open
note reloaded, an unsaved one raised the conflict card. But it never told the
search index, so the note's previous contents stayed searchable indefinitely. A
full-text search, a `with "text"` query, and a `content contains` filter all
answered from whatever the body had been at the last index build.

Only the changed note is re-indexed, so pulling a branch that rewrites many
notes no longer costs a full vault rebuild. Query blocks pick the change up on
their next refresh.
