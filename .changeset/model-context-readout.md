---
"carbide": patch
---

Ask replies now show how much of the retrieval budget the answer used.

When Carbide answers a question from your vault, it gathers as much of the matching material as fits a configurable budget and silently drops the rest. There was no way to tell whether an answer had been given the whole picture or a fraction of it. The Sources section of a reply now reports the share of that budget the turn consumed, with the underlying figures alongside it.

This is deliberately labelled as the Ask retrieval budget and measured in characters, because that is the quantity Carbide actually knows. It is not the model's context window, and no token figure is shown: the agent backends do not report token usage at all today, so any such number would have been invented. Agent-mode turns therefore show no meter rather than a misleading one.
