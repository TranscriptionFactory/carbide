---
title: "Carbide Bug Triage — 2026-03-19"
date_created: 2026-03-19
---

## Priority 1 — File integrity & data safety

These bugs risk data loss or corruption. Fix first.

### 1A. Multi-window race condition on same note (CRITICAL) — IMPLEMENTED

Opening the same note in two panes and editing one causes the other to desync, race on writes, and freeze.

**Root cause area:** `EditorStore` tracks `mtime_ms` and `last_saved_at` per session, but there is no cross-window locking or conflict resolution. `NoteService.create_write_queue()` serializes writes within a single session but not across concurrent sessions on the same file.

**Fix implemented:** "Active pane wins" guard — inactive pane's save is skipped when both panes have the same note open. Cross-pane mtime propagation after every write prevents stale mtime conflicts. See `carbide/implementation/2026-03-19_fix_1a_1b_file_integrity.md`.

**Files changed:** `note_service.ts`, `split_view_service.ts`, `autosave.reactor.svelte.ts`, `reactors/index.ts`

### 1B. Spurious "modified on disk" warnings during normal editing — IMPLEMENTED

Users see false "note has been modified on disk" dialogs while typing, with no external changes.

**Root cause area:** After primary pane writes and gets a new mtime, the secondary pane retained the stale mtime → false `conflict:mtime_mismatch` on next save. Additionally, watcher suppression was only called before the write, not after.

**Fix implemented:** Cross-pane mtime propagation after every write. Watcher suppression refreshed after write completes (called both before and after). Secondary autosave now marks conflicts. See `carbide/implementation/2026-03-19_fix_1a_1b_file_integrity.md`.

**Files changed:** `note_service.ts`, `split_view_service.ts`, `autosave.reactor.svelte.ts`, `reactors/index.ts`

### 1C. File tree doesn't refresh after folder deletion; hidden folders require manual refresh — IMPLEMENTED

**Root cause area:** The Rust watcher's `classify_event()` only emitted events for markdown files. Folder create/remove events were silently dropped. For deleted paths, `abs.is_dir()` returned false since the path no longer exists.

**Fix implemented:** Added `FolderCreated`/`FolderRemoved` variants to `VaultFsEvent`. Extended `classify_event()` with directory detection (extension-absence heuristic for removed paths). Frontend handles folder events with debounced tree refresh. See `carbide/implementation/2026-03-19_fix_1c_folder_watcher.md`.

**Files changed:** `service.rs` (Rust watcher), `watcher.ts` (types), `watcher.reactor.svelte.ts` (handler)

---

## Priority 2 — Editor correctness bugs

These break expected editing behavior. High value because they affect every editing session.

### 2A. Selection-wrap formatting (bold, code, etc.) deletes text instead of wrapping it — IMPLEMENTED

**Current:** Selecting text and pressing backtick (or `**`, etc.) deletes the selection and inserts the delimiter character.\
**Expected:** Selection should be wrapped with the formatting marks (e.g., selected "hello" + backtick → `hello`).

**Root cause area:** `paired_delimiter_plugin.ts` and `inline_mark_input_rules_plugin.ts` only handle typing-triggered inline marks. There is no selection-aware wrapper. Keybindings (Mod-b, Mod-i, Mod-e) do toggle marks on selection, but raw delimiter keys don't.

**Fix implemented:** Added self-pairing delimiter set (```, `*`, `~`) to `paired_delimiter_plugin.ts`. When typing these characters with a non-empty selection, the selection is wrapped with the delimiter on both sides (e.g., selecting "hello" and pressing backtick → ``hello``). Cursor is placed after the closing delimiter. See `carbide/implementation/2026-03-19_fix_2a_2b_editor_selection.md`.

**Files changed:** `paired_delimiter_plugin.ts`

### 2B. Tab key deletes selection / jumps to element instead of indenting — IMPLEMENTED

Closely related to 2A. When text is selected, Tab should indent the block(s), not replace the selection or move focus.

**Fix implemented:** Extended the Tab keymap in `prosemirror_adapter.ts` using `chainCommands`. Tab first tries `sinkListItem` (existing list indentation); if that fails and there's a non-empty selection, the handler returns `true` to prevent the browser/ProseMirror default from deleting the selection. See `carbide/implementation/2026-03-19_fix_2a_2b_editor_selection.md`.

**Files changed:** `prosemirror_adapter.ts`

### 2C. Inline formatting not live-updating in visual mode — INVESTIGATED (no independent bug found)

Formatting (bold, italic, code) sometimes doesn't render until toggling source→visual→back.

**Investigation:** No plugin-level cause found. All `handleTextInput` handlers pass through correctly. No `filterTransaction` or mark-suppression exists. CSS rules for `.ProseMirror strong/em/code` are correct. The primary scenario was during mode transitions where the broken cursor mapping (2D) made it appear that formatting wasn't applied. See `carbide/implementation/2026-03-19_fix_2c_2d_editor_cursor_mapping.md`.

### 2D. Cursor position not mapped correctly when toggling source↔visual mode — IMPLEMENTED

**Root cause:** Two mapping bugs: (1) Visual→source used naive line counting that didn't account for blank lines between blocks, heading prefixes, list markers, blockquotes. (2) Source→visual never restored the ProseMirror cursor from the source editor's position.

**Fix implemented:** Created `cursor_offset_mapper.ts` with bidirectional ProseMirror↔markdown position mapping. Uses parallel text walking (skipping markdown syntax) for forward mapping and binary search for inverse. Mode toggle action now uses these mappers instead of line/col. See `carbide/implementation/2026-03-19_fix_2c_2d_editor_cursor_mapping.md`.

**Files changed:** `cursor_offset_mapper.ts` (new), `prosemirror_adapter.ts`, `editor_service.ts`, `ports.ts`, `app_actions.ts`, `note_editor.svelte`

### 2E. Nested numbered lists sometimes collapsed by linter — NOT STARTED

Nested ordered lists sometimes lose their nesting after the linter/formatter runs.

**Fix direction:** Check which lint/format rule is flattening nested lists. Likely a markdown-lint rule or the Prettier markdown formatter. Inspect the "Problems" panel output for the specific rule, then configure or disable it for nested list contexts.

### 2F. Inline code formatting lost on copy-paste — IMPLEMENTED

Copying text with inline code (`foo`) and pasting loses the code marks — pastes as plain text.

**Root cause area:** `clipboardTextSerializer` used `textBetween()` which strips all marks. Clipboard only received plain text with no formatting syntax, so the markdown paste plugin couldn't detect or restore marks.

**Fix implemented:** Changed `clipboardTextSerializer` to serialize copied content as markdown via `serialize_markdown()`. Clipboard now contains markdown syntax (e.g., `foo`), which `looks_like_markdown()` detects on paste, triggering the markdown parse pipeline that restores all inline marks. See `carbide/implementation/2026-03-19_fix_2f_copy_paste_marks.md`.

**Files changed:** `prosemirror_adapter.ts`

---

## Priority 3 — Editor enhancements (high user value)

### 3A. Settings: editable values in annotated JSON view + terminal color settings — IMPLEMENTED

Two related settings UX items:

1. The "annotated" JSON view in settings should allow inline editing of values (currently read-only display)
2. Terminal colors are unreadable in both light and dark mode (black background + dark text). Expose terminal color settings or inherit from the active theme.

**Fix implemented:** (1) Made `json_annotated_view.svelte` editable: strings → text inputs, numbers → number inputs, booleans → toggle buttons, colors → swatch + text input, nulls → placeholder "auto" inputs. Read-only fields (`id`, `is_builtin`) remain static. (2) Terminal `build_xterm_theme()` now detects light/dark via `data-color-scheme` attribute and provides full 16-color ANSI palette with scheme-appropriate fallbacks. Theme changes trigger terminal re-initialization. See `carbide/implementation/2026-03-19_fix_3a_settings_terminal.md`.

**Files changed:** `json_annotated_view.svelte`, `advanced_panel.svelte`, `terminal_session_view.svelte`

### 3B. Divider (horizontal rule) styling: thickness, color, spacing — IMPLEMENTED

Currently `<hr>` styling was limited to 4 style presets. Users had no control over thickness, color, or spacing.

**Fix implemented:** Added three new settings: `editor_divider_thickness_px` (1–5 slider), `editor_divider_color` (CSS color, empty = theme default), `editor_divider_spacing` (density select). CSS variable pipeline pushes `--editor-hr-thickness`, `--editor-hr-spacing`, and optionally overrides `--editor-hr-gradient-mid` for custom color. See `carbide/implementation/2026-03-19_fix_3b_divider_styling.md`.

**Files changed:** `editor_settings.ts`, `apply_editor_appearance.ts`, `editor.css`, `settings_dialog.svelte`, `settings_actions.ts`

### 3C. Line numbers: toggle in status bar, support in both visual and source modes — IMPLEMENTED

**Fix implemented:** Added `Ln#` toggle button to status bar that toggles `source_editor_line_numbers` with immediate persistence. Visual mode line numbers use CSS counters on `.ProseMirror` block children (no plugin needed). Added `editor.toggle_line_numbers` action and command palette entry. See `carbide/implementation/2026-03-19_fix_3c_line_numbers.md`.

**Files changed:** `action_ids.ts`, `app_actions.ts`, `editor_status_bar.svelte`, `workspace_layout.svelte`, `note_editor.svelte`, `editor.css`, `search_commands.ts`, `command_palette.ts`, `omnibar_actions.ts`

### 3D. Read-only view mode — IMPLEMENTED

**Fix implemented:** Added `"read_only"` as fourth `EditorMode`. Mode cycle: Visual → Source → Read-only → Visual. ProseMirror `set_editable(false)` disables editing via dynamic `editable` prop. Dedicated `editor.toggle_read_only` action jumps directly to/from read-only. Status bar shows "Read-only" label. Command palette entry added. Per-pane, not per-note. See `carbide/implementation/2026-03-19_fix_3d_read_only_mode.md`.

**Files changed:** `editor.ts`, `editor_store.svelte.ts`, `ports.ts`, `prosemirror_adapter.ts`, `editor_service.ts`, `action_ids.ts`, `app_actions.ts`, `note_editor.svelte`, `editor_status_bar.svelte`, `search_commands.ts`, `command_palette.ts`, `omnibar_actions.ts`

### 3E. Terminal background/font color settings — IMPLEMENTED

**Root cause area:** Terminal colors were theme-driven only — no user-configurable override for background or foreground color.

**Fix implemented:** Added `terminal_background_color` and `terminal_foreground_color` settings (empty string = theme default). `build_xterm_theme()` uses user value when non-empty, falls back to theme-derived CSS variable. Settings UI added to Terminal section with text inputs + reset buttons.

**Files changed:** `editor_settings.ts`, `terminal_session_view.svelte`, `settings_dialog.svelte`

---

## Priority 5 — Sprint 2 bugs (identified 2026-03-19 evening)

### 5A. Inline PDF/canvas viewer not rendering — IMPLEMENTED

PDF embeds (`![[file.pdf]]`) showed toolbar with link but no actual PDF viewer content.

**Root cause:** CSP `frame-src` in `tauri.conf.json` only allowed `badgerly-plugin:` and `badgerly-excalidraw:`. The PDF iframe uses `badgerly-asset://` URLs, which was blocked by CSP.

**Fix implemented:** Added `badgerly-asset:` to `frame-src` CSP directive. Also added collapsible toggle button to file embed toolbar — chevron rotates 90° when expanded, clicking hides/shows the preview content area.

**Files changed:** `tauri.conf.json`, `file_embed_view_plugin.ts`, `editor.css`

### 5B. Wikilink Tab autocomplete — IMPLEMENTED

User wanted terminal-style Tab cycling through wikilink suggestions instead of Tab accepting the first match.

**Fix implemented:** Changed Tab behavior in `wiki_suggest_plugin.ts` and `image_suggest_plugin.ts`: Tab now cycles forward through dropdown items (wraps around), Shift+Tab cycles backward. Enter accepts the selected item. Previously Tab and Enter both accepted.

**Files changed:** `wiki_suggest_plugin.ts`, `image_suggest_plugin.ts`

### 5C. Collapsible section cursor trap — IMPLEMENTED

Pressing Enter inside a collapsible section's summary title trapped the cursor — couldn't move to the content below.

**Root cause:** `details_summary` node has `isolating: true` in the ProseMirror schema, preventing default cursor movement across its boundary.

**Fix implemented:** Created `details_keymap_plugin.ts` that intercepts Enter and ArrowDown (at end of summary) inside `details_summary` nodes. Moves cursor to first position inside `details_content`, auto-opening the block if collapsed.

**Files changed:** `details_keymap_plugin.ts` (new), `prosemirror_adapter.ts`

### 5D. Collapsible headings — DEFERRED

User wanted collapsible sections to be more general (headings, etc.) beyond the current blockquote-style `<details>/<summary>` implementation. Assessed as moderate refactor requiring either decoration-based heading folding or schema changes. Deferred per user's instruction.

---

## Priority 6 — Feature ideas (larger scope, needs design)

### 6A. Kanban board plugin — NOT STARTED

Insert a kanban view into a note. Encoded as a markdown table with a special directive/flag (e.g., `<!-- kanban -->` or a fenced block). Renders as draggable columns/cards. Edits write back to the table.

**Open questions:** How to distinguish kanban tables from regular tables? Should dragging happen inline or in a dedicated content pane? Look at how Obsidian Kanban plugin uses YAML+list encoding.

### 6B. AST-indexed SQLite schema (richer metadata/bases) — NOT STARTED

Currently the SQLite index only stores frontmatter. Indexing the full AST would enable queries like "all notes with a task containing X" or "notes linking to Y in a specific section."

**Related:** Richer frontmatter support (nested YAML, hierarchical tags a la Obsidian). Also: configurable task-list inclusion/exclusion so checkboxes don't auto-populate the global to-do view.

### 6C. Calendar / daily-notes integration — NOT STARTED

Explore Logseq/Lokus-style daily notes and calendar view. Needs design around: where daily notes live, template system, calendar navigation UI.

---

## Suggested implementation order

| Phase        | Items                                                | Rationale                                                                                                              |
| ------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Done**     | 1A + 1B (file integrity)                             | Implemented 2026-03-19: cross-pane mtime propagation + inactive-pane save guard                                        |
| **Done**     | 2A + 2B (selection wrapping + tab indent)            | Implemented 2026-03-19: self-pairing delimiters + selection-safe Tab guard                                             |
| **Done**     | 2C + 2D (formatting render + cursor mapping)         | Implemented 2026-03-19: bidirectional cursor mapper + mode toggle cursor restore                                       |
| **Done**     | 1C, 2F, 3A (watcher + paste + settings)              | Implemented 2026-03-19: folder watcher events + clipboard markdown + editable JSON + terminal colors                   |
| **Done**     | 3B, 3C, 3D (divider + line numbers + read-only)      | Implemented 2026-03-19: HR thickness/color/spacing + status bar line toggle + read-only mode                           |
| **Done**     | 5A, 5B, 5C, 3E (PDF + suggest + collapse + terminal) | Implemented 2026-03-19: CSP frame-src fix + collapsible embed + Tab cycling + details keymap + terminal color settings |
| **Deferred** | 5D (collapsible headings)                            | Moderate refactor — needs decoration-based heading folding or schema changes                                           |
| **Soon**     | 2E                                                   | Independent fix, scoped to lint/format config                                                                          |
| **Backlog**  | 6A, 6B, 6C                                           | Need design decisions before implementation                                                                            |
