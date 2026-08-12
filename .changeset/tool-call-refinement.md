---
"carbide": patch
---

Agent tool calls now show what they actually ran, instead of `Terminal {}`.

A tool call is announced the moment the model starts emitting it, before its arguments have finished streaming — so the first frame carries an empty input, and for tools whose display name is derived from that input, an empty name too. Carbide took its summary and its title from that first frame and never revisited them. The corrected values arrived a moment later and were decoded, used internally to work out which files the call touched, and then thrown away. A shell command therefore showed as `Terminal {}` for the entire life of the call, however long it ran.

Tool cards now pick up the refined command and name when they arrive. A later update that carries nothing cannot overwrite a summary that already arrived, so a call does not lose its detail partway through. Where a permission prompt already had the complete arguments, that text is now used to repair a placeholder rather than being discarded.

Calls that genuinely never report arguments now render no summary at all, instead of an empty `{}`.
