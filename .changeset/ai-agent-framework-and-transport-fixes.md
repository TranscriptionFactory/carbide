---
"carbide": minor
---

feat(ai): generalized agent framework (codex CLI, native loop, citations, inline edit) + transport regression fixes

- **Codex CLI agent support**: `codex_cli` providers now resolve to a dedicated harness adapter with per-CLI MCP wiring. Codex config isolation honors the user's `~/.codex` auth/model/endpoint while resetting `mcp_servers` to carbide-only (verified against codex-cli 0.144.3 `-c` deep-merge), mirroring the claude adapter's `--strict-mcp-config` posture.
- **Native agent loop**: bounded history replay with eviction, plus a `HarnessAdapter` seam and data-driven capability descriptors behind it.
- **Agent-mode citations**: read-tool events are surfaced as citations in agent replies.
- **Agentic inline edit**: native-backend inline edits with a read-only tool selector and diff-apply sink.
- **Surface policy + safe mode**: harness safe mode excludes mutating MCP tools, at parity with the native agent (pinned by a real-catalog read-only parity test).
- **Transport regression fixes**: guard transport-less provider reads (`transport?.kind`) so auto-backend detection no longer crashes on persisted providers; gate "unreachable / check your connection" wording on API transport so CLI providers get a local-cause hint (auth/model/endpoint); replace the dead-end "No streaming-capable provider" toast with an actionable message; name the failing command in opaque non-zero-exit errors.
