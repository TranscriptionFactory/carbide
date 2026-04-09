# Carbide Bug Tracker

> Tracks known bugs and regressions.
> Status: `[ ]` open | `[~]` investigating | `[x]` fixed | `[-]` wontfix

---

## Editor — Paste & Input Handling

### BUG-001: Pasting indented lists breaks document structure

- **Status:** `[x]`
- **Severity:** High
- **Repro:** Paste an indented list into a document that has no front matter, before a code block
- **Expected:** Indented list renders correctly in visual mode
- **Actual:** List structure breaks on paste
- **Fix:** Widened `LIST_REGEX` to detect arbitrary-depth indented lists (`\s*` instead of `\s{0,3}`). Added `is_single_list_block` helper to merge nested lists into existing list context with `open_depth = 2`. Added try/catch fallback for paste failures.

### BUG-004: Pasted link produces malformed markup and breaks visual mode

- **Status:** `[x]`
- **Severity:** High
- **Repro:** Paste a URL into visual mode
- **Expected:** Clean link insertion (either raw URL or `[text](url)`)
- **Actual:** Produces `<url>![](url)` — a mangled image/link hybrid. After paste, numbered lists, code fences, and headings all break; only images render correctly.
- **Fix:** Added `is_bare_url` detection in `pick_paste_mode` — bare URLs now bypass the HTML→markdown pipeline entirely and are inserted directly as ProseMirror link marks. Added try/catch around `replaceSelection` with plain-text fallback to prevent document tree corruption.

---

## Editor — Source Mode & Persistence

### BUG-002: Round-trip source edits not retained; dirty state lost on tab switch

- **Status:** `[x]`
- **Severity:** High
- **Repro:**
  1. Open a note in source editor
  2. Make edits, save
  3. Switch to another tab, then switch back
- **Expected:** Edits are preserved in source mode
- **Actual:** Edits disappear in source mode (but are preserved in visual mode)
- **Fix:** (A) Moved `clear_source_content_getter()` to AFTER the flush in `onDestroy`, ensuring `flush()` can read the getter before it's cleared. (B) Added `cm_content_cache` to EditorStore for doc+cursor caching across tab switches. Full undo history caching deferred — requires architectural change to avoid CM destroy/recreate on tab switch.

---

## Editor — Front Matter

### BUG-003: Front matter parsing issues; text added to blank documents lands in front matter

- **Status:** `[x]`
- **Severity:** Medium
- **Repro:**
  1. Create a blank document (no front matter)
  2. Start typing text
- **Expected:** Text is added as document body content
- **Actual:** Text is sometimes captured as front matter content
- **Fix:** Phase 1: Added `isolating: true` and `selectable: false` to frontmatter NodeSpec. Created `frontmatter_guard_plugin.ts` that redirects selection away from frontmatter nodes via `appendTransaction`. Phase 3: Created canonical `parse_frontmatter` utility in `$lib/shared/domain/frontmatter_parser.ts`. Migrated `frontmatter_writer.ts` and `frontmatter_sync.ts` to use it. Phase 2 (collapsible UI) deferred as UX enhancement.
