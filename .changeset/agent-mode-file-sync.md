---
"carbide": patch
---

fix(agent): make agent-mode file edits visible in the app

- **Changed files are recorded again**: tool paths were parsed out of a 200-character-truncated JSON summary whose keys serde sorts alphabetically, so for `Write` the `content` field pushed `file_path` past the cutoff and the path never survived. Paths and a `mutating` flag now ride structurally on the `ToolStart` event from both the Claude and Codex harness adapters, with the summary parse kept only as a fallback.
- **The vault refreshes after every mutating turn**, keyed off "a mutating tool ran" rather than off successfully-resolved paths, so a parse failure can no longer swallow the refresh.
- **Open notes reload without prompting**: a clean open note picks up an agent's edit immediately; a dirty one surfaces a conflict instead of being clobbered.
- **Deleted and renamed notes clean up their tab** rather than attempting to reopen a path that no longer exists.
- **Self-write suppression is one-shot** (2s) instead of a blanket 10-second per-path mute, so an agent write landing just after an autosave is no longer swallowed.
- **Background-tab saves are mtime-guarded**, closing the last hole where an external write could be overwritten silently.

Native-backend runs also record changed files for the first time — their tool names are unprefixed, so the previous name-based check never matched.
