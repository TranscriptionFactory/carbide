# Sprint Evaluation — 2026-03-16

## Issues Found

### 1. Date Link Autosuggest Not Working in Editor

- **Root cause:** CSS styles missing for `.DateSuggestMenu` — plugin was registered and functional but the popup was invisible.
- **Fix:** Added CSS styles to `src/styles/editor.css` matching the existing WikiSuggest/SlashMenu pattern.
- **Status:** FIXED
- Sprint ref: `sprints/2026-03-16_date_link_autosuggest.md`

### 2. No Setting to Change Configurable Note Name

- **Root cause:** Backend (type, catalog, domain logic, action wiring) was complete but no UI input existed in the settings dialog.
- **Fix:** Added "Default Note Name" input with description and reset button to the Files section of settings dialog.
- **Status:** FIXED
- Sprint ref: `sprints/2026-03-16_configurable_note_naming.md`

### 3. Typographic Substitution Not Working in Editor

- **Root cause:** Evaluation tested em dash (`--` → `—`) and smart quotes (`"` → `""`), which were **deliberately removed** in commit `11e7851` due to conflicts with Markdown syntax (`---` = horizontal rule, `--` = strikethrough in some parsers).
- **Current scope:** Plugin implements 6 arrow substitutions only: `-->` → `→`, `==>` → `⇒`, `<--` → `←`, `<==` → `⇐`, `<->` → `↔`, `<=>` → `⇔`.
- **Status:** WORKING AS DESIGNED — arrow substitutions are functional. The evaluation examples were out of scope.
- Sprint ref: `sprints/2026-03-16_typographic_substitution.md`

### 4. No Way to Add Tags / Frontmatter Status

- **Root cause:** The frontmatter widget works for editing existing YAML blocks, and the tag sidebar browses existing tags — but there was no way to **create** frontmatter on a note that doesn't have one.
- **Fix:** Added `editor.insert_frontmatter` action (available via command palette: "Insert Frontmatter") that prepends an empty YAML block with a `tags` field to the current note.
- **Status:** FIXED
- Sprint ref: `sprints/2026-03-16_tags_ui_panel.md`

### 5. Code Block Theming & Font Customization

- **Current state:** Shiki syntax highlighting is fully integrated and working. Themes are hardcoded to `github-light`/`github-dark` based on color scheme.
- **Missing:** Theme selector UI, separate code block font family/size settings, settings type fields, catalog entries.
- **Status:** REQUIRES SEPARATE SPRINT — scope is larger (types + settings + plugin + UI + theme bundling).
- Sprint ref: `sprints/2026-03-16_shiki_syntax_highlighting.md`

### 6. Floating Outline Collapse Behavior

- **Root cause:** (a) No visible collapse/expand toggle button in the floating panel header — only an X to switch to rail mode. (b) Collapse state reset to `false` on mode change and vault switch.
- **Fix:** (a) Added collapse/expand toggle button (ChevronsUpDown icon) to the floating outline header. Panel now renders collapsed (header-only) when toggled. (b) Removed the forced `floating_outline_collapsed = false` reset from `set_editor_settings()` and `reset_for_new_vault()` so collapse state persists.
- **Status:** FIXED
