---
"carbide": minor
---

### Features

- Daily notes: full feature with folder/name-format settings, sidebar view, app integration, and daily-note-exists-on-disk handling
- Theme system: V4 CSS token aliases (`--fg-2`, `--glass`, `--accent-glow`, `--on-accent`), `generate_ui_tokens()` with surface params, and `ThemeBlueprint` + `expand_blueprint` for all builtin themes
- Daily notes folder and name format exposed in settings UI
- Task query blocks: Obsidian Tasks-style DSL parser, `/tasks` slash command, live-rendered query results in `language="tasks"` code fences with grouped task list, toggleable checkboxes, and debounced re-render

### Fixes

- Vault startup made non-blocking by parallelizing independent ops
- `remark_details` inner parse, dead branch removal, and `pm_to_mdast` image merge fix
- Diagnostics `get_markdown` moved from module scope into call site
- Redundant `image_toolbar_plugin.ts` deleted
- Type annotation for `nodesBetween` callback return
- Four bug fixes: folder save, AI panel, paste handler, image resize
- Theme token consistency and test coverage improvements
- Daily note that exists on disk but not in store now handled correctly

### Refactors

- Generic suggest plugin factory extracted
- Hardcoded oklch values in theme CSS replaced with token refs
- Sidebar icons updated for tags and bases
