---
"carbide": minor
---

Native Agent Mode: agent mode now works with any OpenAI-compatible API provider
(Ollama, LM Studio, OpenAI, …), not just Claude Code. A Carbide-owned tool loop
drives the vault MCP catalog directly — vault-scoped by construction, with safe
mode withholding mutating tools and power mode auto-approving them. The panel
header shows which backend is active ("vault-scoped" vs "full access"), sessions
persist tool calls/results, and the MCP tool schemas gained hygiene fixes plus a
new `edit_note` tool for targeted string edits.
