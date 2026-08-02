---
"carbide": minor
---

feat(assistant): one session history for every AI surface — sessions as tabs, omnibar Ask, inline ⌁ logging

Chat, inline edits and background AI work now share a single session store with one
persisted format (`.carbide/assistant/`, per-session files; legacy `rag/` sessions
migrate read-through on first save) and one hydration pass per vault switch. The
chat panel's session list shows every kind with filters and a collapsed ⌁ group;
sessions open as workspace tabs that stay live (renames sync both ways) and restore
across restarts, with a friendly empty state when the session is gone. Accepted
inline edits are logged as ⌁ sessions with a "Continue in chat" toast action, and
sessions older than a configurable retention window (default 30 days) are pruned on
vault open. The omnibar gains an Ask mode (click or ⌘/): cited streaming answers
from anywhere, on explicit submit only — esc stops a live run and keeps the answer,
⌘↵ inserts at the cursor, ↵ continues in a chat tab. Stopping a run is now
distinguishable from success everywhere — a stopped title generation writes
nothing, and Stop works from the instant a run exists, including during provider
resolution. The old flat inline history (`ai/history.json`) is retired.
