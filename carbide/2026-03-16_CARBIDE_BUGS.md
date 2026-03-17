# Carbide — Bug & Improvement Triage (2026-03-16)

> Cross-referenced against `carbide/TODO.md` and `carbide/PRIORITIES.md`.
> Priority: P0 = fix now, P1 = next sprint, P2 = backlog, P3 = nice-to-have.

---

## P0: Regressions & Data-Integrity Bugs

### 1. File-modified-on-disk race condition (autosave conflict) — IMPLEMENTED

**Symptom:** Toast "note has been modified externally" fires spuriously; potential data loss if autosave overwrites a concurrent external edit.
**Status:** Not tracked in TODO.md. This is a regression — previously resolved, now back.
**Action:** Audit the file-watcher ↔ autosave interaction. Likely need a write-epoch or mtime guard so the watcher ignores saves the app itself triggered. High risk of silent data loss — fix first.
**Resolution:** Replaced counter-based watcher suppression with timestamp-based suppression. See `carbide/sprints/2026-03-16_sprint.md` for details.

### 2. LaTeX equations broken — IMPLEMENTED

**Symptom:** Math rendering (`$...$` / `$$...$$`) not working.
**Status:** Phase 6b (Math/LaTeX Support) is marked **COMPLETED** in TODO.md. This is a regression.
**Action:** Check whether a dependency update (Milkdown, remark-math, or KaTeX) broke the plugin registration or node schema. Likely a quick fix once root cause is identified.
**Resolution:** Root cause was three-fold: (a) no input rules for typing math in the editor — only `/math` slash command existed for block math, (b) line break preprocessor corrupted LaTeX with trailing backslashes inside `$$` blocks, (c) MathBlockNodeView didn't propagate updates to Svelte component. See `carbide/sprints/2026-03-16_sprint.md` for details.

### 3. `.badgerly` folder created in browse/non-vault mode — IMPLEMENTED

**Symptom:** Opening a folder in browse mode still writes a `.badgerly/` config directory.
**Status:** Not tracked. Config/state leak bug.
**Action:** Guard vault-config writes behind an `is_vault` check. For browse mode, use an in-memory or global-level default config instead of writing to disk. Small fix, but violates user trust — apps shouldn't write to directories the user didn't designate as vaults.
**Resolution:** Added vault mode guards to `set_vault_setting`, `set_local_setting`, and `ensure_worker` (search index) at the Rust backend level. Split `local_state_path` into read/write variants so reads don't create directories. See `carbide/sprints/2026-03-16_badgerly_browse_mode_fix.md` for details.

---

## P1: Performance & Core UX Gaps

### 4. Vault initial indexing too slow (\~30s spinner) — IMPLEMENTED

**Symptom:** First-time vault open shows Apple spinning wheel for \~30 seconds.
**Status:** Not tracked. Related to Phase 3M (Metadata Cache) indexing pipeline.
**Action:** Profile the indexing path (FTS + frontmatter + metadata). Likely candidates: synchronous SQLite inserts without batching, or blocking the main thread during file walk. Consider: batch inserts in a transaction, progressive/async indexing with a progress bar, or indexing in a background thread that doesn't block the UI.
**Resolution:** Root cause was `load_note_count()` blocking all vault open IPC commands with a synchronous WalkDir scan. Removed sync note count from open path; vault now opens instantly using cached count and refreshes asynchronously. Added SQLite PRAGMAs (8MB cache, 256MB mmap) and moved outlink resolution inside transactions. See `carbide/sprints/2026-03-16_vault_indexing_perf.md` for details.

### 6. Global search omnibar keyboard shortcut not working/discoverable — VERIFIED WORKING

**Symptom:** User expects a keyboard shortcut for vault-wide search but can’t find or trigger it.
**Status:** Omnibar exists (Phase 6c references it). Shortcut may not be bound or discoverable.
**Action:** Verify `Cmd+Shift+F` (or equivalent) is bound and working. If it exists, this is a discoverability issue — add it to help/onboarding. If missing, bind it.
**Resolution:** `Cmd+Shift+F` is already bound to `omnibar_open_all_vaults` (searches across all vaults). `Cmd+O` opens omnibar for current vault. `Cmd+P` opens command palette. All three are registered in `default_hotkeys.ts` and wired to omnibar actions. This was a discoverability issue, not a code bug.

### 7. Floating outline panel shortcut not working — IMPLEMENTED

**Symptom:** User wants a quick-access shortcut for the outline.
**Status:** Phase 2 (Outline View) is **COMPLETED** with `Cmd+Shift+O`, but this opens the right rail outline (even when floating outline is enabled). Make a toggle/shortcut to show/collapse the outline in floating view. The user can always manually close the outline by pressing ‘x’ or can open the right rail outline if desired.
**Resolution:** `Cmd+Shift+O` (`ui_toggle_outline_panel`) now checks `editor_settings.outline_mode`. When `"floating"`, it toggles `floating_outline_collapsed` (new UIStore state) instead of the context rail. The floating outline component respects this state. Collapsed state resets when switching outline modes. See `carbide/sprints/2026-03-16_shortcut_fixes.md` for details.

---

## P2: Editor Enhancements (Aligns with PRIORITIES.md Tier 2–3)

### 8. Code block syntax highlighting with Shiki — NOT STARTED

**Symptom:** User wants richer code block highlighting (Shiki-quality) in the Milkdown editor.
**Status:** Phase 7 ships CodeMirror-based read-only syntax highlighting for non-markdown files. In-editor code blocks use Milkdown's default (basic). Not tracked as a TODO item.
**Action:** Evaluate `@milkdown/plugin-shiki` or a custom ProseMirror NodeView wrapping Shiki. Medium effort — nice upgrade but not blocking workflows. Defer behind P1 items. View `/Users/abir/src/KBM_Notes/scratch` for a potentially portable implementation

\

### 9. Typographic auto-substitution (arrows, em-dashes, etc.) — NOT STARTED

**Symptom:** User wants `->` to auto-convert to `→`, `--` to `—`, etc.
**Status:** Not tracked. Small editor polish item.
**Action:** ProseMirror `inputRules` — a handful of regex rules. Small, self-contained. Could be a quick win or a demo plugin for the plugin system (Phase 8).

### 10. Configurable default note naming (`{YYYY-MM-DD-HHMM}` vs `Untitled`) — NOT STARTED

**Symptom:** User wants to configure the default filename pattern for new notes.
**Status:** Not tracked.
**Action:** Add a vault setting for `default_note_name_template` with strftime-style tokens. Small backend + settings UI change. Pairs well with auto-commit settings UI (PRIORITIES.md Tier 3, #5).

### 11. Date link auto-suggest on typing — NOT STARTED

**Symptom:** Typing a date or `@today` should pop up a date picker or insert a formatted date link.
**Status:** Not tracked. Related to frontmatter date support (Phase 3M, done) but this is an editor-level autocomplete.
**Action:** Extend the slash command system or add an `inputRule` that detects date-like patterns and offers a completion popup. Medium effort — depends on how rich the interaction should be.

### 12. AI streaming to note + markdown formatting retention — NOT STARTED

**Symptom:** Long AI responses in the side rail are laggy; markdown formatting (bold, headers) not rendered.
**Status:** Phase 6d (AI CLI Integration) is **COMPLETED** but the panel UX has known rough edges. "Structured edit proposal contract" is the one remaining TODO item.
**Action:** Two sub-issues: (a) Stream long responses incrementally instead of waiting for full completion — likely needs chunked event handling in the AI panel. (b) Render AI response markdown properly (the panel may be using plain text). Both are polish on an existing feature.

---

## P3: Future Features & Exploration

### 13. Tags UI surface — NOT STARTED

**Symptom:** User wants document tags.
**Status:** Tag infrastructure **exists** — Phase 3M (Metadata Cache) ships `note_tags` SQLite table, frontmatter tag parsing, and per-note tag accessors. The gap is likely a dedicated tags panel/browser/filter UI.
**Action:** Build a "Tags" panel (sidebar or omnibar filter) that queries `note_tags` and shows tag → note mappings. The backend is done; this is purely frontend. Consider combining with Bases (Phase 3B) which already has query/filter infrastructure.

### 14. Calendar view — NOT STARTED

**Symptom:** User wants a calendar view for daily notes.
**Status:** Not tracked. Net-new feature. Related to date-based note naming (#10).
**Action:** Requires a date → note mapping (by filename pattern or frontmatter `date` field — the latter is already indexed by Phase 3M). Render a calendar grid in a sidebar panel. Medium-large effort. Defer until note naming conventions (#10) are settled.

### 15. Higher contrast menus + additional themes — NOT STARTED

**Symptom:** Menu highlighting too subtle; limited theme options.
**Status:** Not tracked. UX polish.
**Action:** Audit CSS custom properties for menu states (hover, active, focus). Add 2–3 additional themes (e.g., high-contrast, solarized, nord). Could be a plugin system showcase (Phase 8) — theme plugins.

### 16. Plugin system maturation (MCP, themes, fonts) — NOT STARTED

**Symptom:** User wants to test extensions — MCP integration, custom themes, font colors.
**Status:** Phase 8 (Plugin System) is partially complete. Missing: TypeScript SDK, proper load/unload, hot-reload, Tauri command gating. Demo plugins exist but the platform isn't ready for user-authored plugins.
**Action:** Aligns with Phase 8 remaining items. Priority depends on whether plugins are needed for the current user base (0 users per AGENTS.md). Defer until core editor is solid.

### 17. Knowledge graph (full-vault view) — NOT STARTED

**Symptom:** User wants a global knowledge graph, not just 1-hop neighborhood.
**Status:** Directly maps to **PRIORITIES.md Tier A1 (Full-vault graph)** — the #1 recommended next step in the graph roadmap. Also connects to A2 (multi-hop), A3 (semantic edges).
**Action:** Follow the sequencing in PRIORITIES.md: A1 + A2 first (pure graph, no ML), then B1 (sqlite-vec embeddings) to unlock semantic features.

### 18. Link from headings (anchor links) — NOT STARTED

**Symptom:** User wants to link to specific headings within a note (`[[Note#Heading]]`).
**Status:** Not tracked. Wikilink resolution (Phase 0 cross-cutting) resolves note-level links but not heading anchors.
**Action:** Extend wikilink resolution to support `#heading` fragments. On click, scroll to the target heading (Phase 2 outline infrastructure already has heading-to-position mapping). Medium effort — touches the link parser, resolver, and editor click handler.

### 19. Draggable sections (block-level drag & drop) — NOT STARTED

**Symptom:** User wants to drag paragraphs/sections to reorder.
**Status:** Not tracked. Advanced editor feature.
**Action:** ProseMirror supports node drag handles via decorations. Significant UX and interaction design work. Low priority — most markdown editors don't have this. Defer.

---

## Recommended Attack Order

**Immediate (P0 — regressions/data bugs):**

1. File-modified race condition (#1) — data loss risk
2. LaTeX regression (#2) — completed feature now broken
3. `.badgerly` folder leak (#3) — trust violation

**Next sprint (P1 — core UX):**
4\. ~~Vault indexing performance (#4) — first impression killer~~ DONE
5\. Find & Replace (#5) — table-stakes editor feature
6\. ~~Verify omnibar/outline shortcuts (#6, #7) — possibly just discoverability fixes~~ DONE

**Then (P2 — editor polish, aligns with PRIORITIES.md Tier 2):**
7\. Contextual Command Palette (already in PRIORITIES.md Tier 2 #1)
8\. AI streaming + markdown rendering (#12)
9\. Typographic substitution (#9) — quick win
10\. Configurable note naming (#10)

**Backlog (P3 — new features):**
11\. Tags UI (#13), Calendar (#14), Anchor links (#18)
12\. Full-vault graph (#17) — per PRIORITIES.md sequencing
13\. Theme expansion (#15), Plugin maturation (#16)
14\. Code highlighting upgrade (#8), Draggable sections (#19)
