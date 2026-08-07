---
"carbide": minor
---

Agent tool calls can now ask you first. Safe and power presets are the default prompt policy rather than a tool blocklist: reads and searches run freely, safe mode asks before file edits, and shell commands and deletions ask in both modes. The prompt appears inline on the tool's transcript card — Allow once as the primary action, an escalating "Always allow" grant, and a quiet Deny — while the run shows "Waiting for approval" and Stop remains available (stopping settles the prompt as dismissed, and unanswered prompts time out after ten minutes). "Always allow" grants persist per agent and tool, are listed in settings with per-row revoke, and the native API loop now surfaces the same prompts instead of silently refusing writes in safe mode. Every resolution — user-chosen or automatic — is recorded on the transcript, and reloaded sessions show settled outcomes.
