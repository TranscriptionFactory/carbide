---
"carbide": minor
---

Agent capability is now derived from a provider's transport instead of chosen from a
free-floating four-way descriptor.

API providers always get the native OpenAI-compatible agent loop. CLI providers are
agent-capable only when the transport itself names the harness protocol the CLI speaks
(`harness: "claude" | "codex"`); a plain CLI such as `lms chat <model> -p <prompt>` is
text-only — the incoherent states the old model could express (an OpenAI-compat descriptor
on a CLI, a Claude descriptor on an API server) are no longer representable. Persisted
settings carrying the old `agent` descriptor, or descriptor-less `claude`/`codex` preset
ids, migrate on vault open.

The settings UI shows the computed capability under every provider and offers a Harness
select on custom CLI providers. The chat-mode badge names the actual harness (Claude Code
or Codex), vault handoff is refused for non-Claude providers instead of sending Codex a
Claude-only flag set, and the Rust dispatcher now errors on an unknown adapter instead of
silently falling back to Claude.
