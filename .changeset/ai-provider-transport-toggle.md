---
"carbide": patch
---

Let a custom AI provider change its transport after it is created

A custom provider's transport — CLI or API — could be chosen once, on the form
that created it, and never again. The edit panel exposed everything else about
the provider (name, command, base URL, model, ACP agent) but not the one field
that decides which of those are even applicable.

That was more than an inconvenience, because the ACP agent picker only appears
for CLI providers. A provider added as API could therefore never be given an ACP
agent, and so was permanently shut out of agent mode. The only way across was to
delete the provider and add it again, losing its settings.

The edit panel now carries the same Transport control as the create form, for
any provider you added yourself. Presets are unchanged — their transport is part
of what makes them that preset.

Switching transport keeps everything outside the transport (name, model) and
starts the new transport's own fields empty, since the two kinds share none:
command and arguments belong to CLI, base URL and API key variable to API. An
ACP agent is dropped when you switch to API, where it would have no effect.
