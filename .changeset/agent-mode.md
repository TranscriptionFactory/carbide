---
"carbide": minor
---

Agent Mode: the assistant panel gains an Ask|Agent toggle that runs Claude Code
headless against your vault — live tool-call rows, changed-files list with
click-to-open, abort, and session resume, with a git checkpoint before every
agent turn. Safe mode (default) limits the agent to Carbide's note tools; Power
mode allows file edits (per-session picker, default configurable in settings).
Also adds "Open Vault in Agent Terminal" to the palette, launching an
interactive Claude Code session at the vault root with Carbide's MCP tools
preconfigured.
