---
"carbide": minor
---

Agent transcripts get a proper tool-call kit: each call renders as a collapsible card (collapsed by default, auto-expanding only on a live failure) with a status-by-exception header — spinner while running, a transient check on live completion, a destructive cross on failure — and an expandable body showing the full input, the tool's result summary in a mono block, and clickable path chips. Tool results now carry a `result_summary` through the whole event chain, and agent-mode reasoning streams into the transcript instead of being dropped. Safe/power hygiene rode along: a new chat always starts in Ask mode, the retrieval scope bar hides in agent mode where it was inert, and the Power toggle's hint now says what the grant actually is per backend — vault-scoped edits on native, full system access on a CLI harness.
