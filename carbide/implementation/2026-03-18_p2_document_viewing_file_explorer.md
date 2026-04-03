# P2 Sprint: Document Viewing & File Explorer — 2026-03-18

## Items

### #7 — Default render unknown files as syntax-highlighted text

**Status:** ✅ IMPLEMENTED

**Root cause:** Two filters block unknown file types:

1. **Rust backend** (`service.rs:18-25`): `VIEWABLE_EXTENSIONS` whitelist — files with unlisted extensions are excluded from `scan_folder_entries()` entirely, so they never appear in the file tree
2. **Frontend** (`document_actions.ts:63`): `detect_file_type()` returns `null` for unknown extensions → action bails with `if (!file_type) return;`
3. **Viewer** (`document_viewer_content.svelte:48`): No fallback branch for unknown file types

**Changes needed:**

- Rust: Remove `is_viewable_extension` filter — show all files in the tree
- Frontend `document_types.ts`: Add fallback in `detect_file_type()` — return `"code"` for unknown but valid files
- Frontend `document_actions.ts`: Remove the `if (!file_type) return` guard (since we always have a type now)
- Viewer component already handles `"code"` type, so no change needed there

### #9 — Links should reference any file type

**Status:** ✅ IMPLEMENTED

**Root cause:** `handle_resolved_internal_target()` in `note_actions.ts:171` checks `detect_file_type()` — if null, it falls through to `shell.open_path()` (opens in system app). With #7's fix making `detect_file_type` always return a type, this is automatically resolved.

**Additional issue:** `ensure_md_extension()` in `wiki_link_plugin.ts` adds `.md` to any target without an extension. This is correct behavior for wikilinks (they're note-first). Markdown links `[text](path)` already support arbitrary paths.

**Changes needed:** None beyond #7's changes — once `detect_file_type` returns a type for all files, links to any file will open the code viewer.

### #10 — Right-click context menu for files

**Status:** ✅ IMPLEMENTED

**Current state:** File context menu (`file_tree_row.svelte:427-452`) only has "Open to Side" and "Open in New Window". Missing: copy path, copy absolute path, reveal in Finder, open in external app.

**Changes needed:**

- Add context menu items to file_meta branch in `file_tree_row.svelte`
- Add callbacks: `on_copy_path`, `on_reveal_in_finder`, `on_open_in_external_app`
- Use `navigator.clipboard.writeText()` for copy (already used for folders/notes)
- Add action for reveal in Finder via shell port
- Add action for open in external app via shell port

### #11 — Hidden files not fully shown in file explorer

**Status:** ✅ IMPLEMENTED

**Root cause:** Rust backend `scan_folder_entries()` (line 749) unconditionally skips files starting with `.` — `show_hidden_files` setting only applies on frontend, but files never reach the frontend.

**Changes needed:**

- Rust: Add `show_hidden_files: bool` parameter to `list_folder_contents` command
- Rust: Pass it through to `scan_folder_entries` and conditionally skip dotfiles
- Frontend adapter: Pass `show_hidden_files` setting when calling the command
- Frontend port: Update interface signature
- Cache key: Include `show_hidden_files` in the cache key to avoid stale results

### #12 — Collapse all folders shortcut

**Status:** ✅ IMPLEMENTED

**Current state:** Action `folder.collapse_all` already registered and wired to workspace buttons. Missing: keyboard shortcut binding.

**Changes needed:**

- Add keyboard shortcut binding in `use_keyboard_shortcuts.svelte.ts`
- Shortcut: `Cmd+Left` (macOS) / `Ctrl+Left` (others) when file explorer is focused

---

## Implementation Groups

| Group | Items                                        | Parallel?     |
| ----- | -------------------------------------------- | ------------- |
| A     | #7 + #9 (unknown file rendering + links)     | Yes, worktree |
| B     | #11 (hidden files — backend + frontend)      | Yes, worktree |
| C     | #10 + #12 (context menu + collapse shortcut) | Yes, worktree |
