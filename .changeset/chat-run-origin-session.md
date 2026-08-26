---
"carbide": patch
---

Open the chat session when a chat run is clicked in the runs popover

Runs started from the chat panel carried no origin, so the runs popover in the
status bar rendered them as inert rows: clicking a live or failed chat run did
nothing, even though the transcript it belonged to was a click away. The chat
panel now tags each turn with the session it belongs to, and the run records
that session, so a chat run opens its session tab like an inline or agent run
already does. Runs with no session of their own — one-shot note actions,
background work and queries answered over MCP — stay unopenable, which is the
correct behaviour for them.
