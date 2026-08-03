---
"carbide": minor
---

feat(assistant): the bottom Assistant tab, persistent proposals, and editing the open tab

The bottom panel's **AI** tab becomes **Assistant** — a projection of the one assistant chat, so a
conversation started in the sidebar continues in the panel and vice versa. `Cmd/Ctrl+Shift+A`, the
Tools menu and the palette command all open it; a persisted hotkey override for the old action id
migrates automatically. Opening it seeds an untouched conversation with what you are looking at: an
open note becomes a "This note" scope, an open editable document is attached.

**Pending proposals now survive a restart.** They persist per vault in
`.carbide/assistant/proposals.json`; applied and rejected proposals are never written and cannot
resurrect, and a note edited while the app was closed still resolves stale at accept. The review
centre groups proposals by day (Today / Yesterday / date) with per-session provenance inside, and
is now reachable from the chat strip's "Review proposals →", the chat header count, the presence
popover, a toast after accepting a notice, and the **Review AI Proposals** palette command.

**Editing the open tab** moves into the assistant: the composer's secondary **Edit** button
proposes a rewrite of the open note or an editable document (e.g. an `.html` artifact), and **This
document** attaches the document so Ask can answer questions about it. Results land as reviewable
proposals — accepting a document proposal stages the buffer and marks the tab dirty; saving the tab
writes disk. The legacy AI Assistant dialog is retired (archived on `archive/ai-panel-main`);
inline ask/edit in the editor is unchanged.
