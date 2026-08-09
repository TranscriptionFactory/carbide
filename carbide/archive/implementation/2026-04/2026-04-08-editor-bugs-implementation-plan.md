# Editor Bug Fixes — Implementation Plan

> 2026-04-08 · Covers BUG-001 through BUG-004 from `carbide/bugs.md`
> Plus: front matter fragility audit (systemic concern)

---

## Architecture Context

**Paste pipeline:** `handlePaste` → `pick_paste_mode()` → remark parse → `mdast_to_pm` → `Slice` → `replaceSelection`

**Source editor lifecycle:** CodeMirror mounts/destroys on every mode switch and tab switch. 50ms debounced sync to `EditorStore.open_note.markdown`. Flush on destroy. No buffer cache (unlike ProseMirror which has `buffer_map`).

**Front matter:** Three independent parsers exist — remark-frontmatter (pipeline), `FRONTMATTER_RE` regex (frontmatter_writer.ts), `indexOf` (frontmatter_sync.ts). The ProseMirror `frontmatter` node is `display:none` in visual mode. Its position as first child of `doc` is assumed by cursor mapping, paragraph guarantees, and serialization.

---

## BUG-001: Pasting indented lists breaks document structure

### Root Cause Analysis

The paste handler in `markdown_paste_plugin.ts` converts clipboard content to markdown, then parses via remark. The `open_depth` logic determines how the pasted content merges into the existing document:

- Single textblock → `open_depth = 1` (inline merge)
- Single flat list item → `open_depth = 2` (merge into current list)
- Everything else → `open_depth = 0` (full block insert)

**Problem:** An indented (nested) list hits the `open_depth = 0` path, which inserts it as a standalone block. If the paste target is inside an existing list or paragraph, the block-level insertion can break the surrounding structure. Additionally, the "no front matter, before code block" condition suggests the parser may be misidentifying the paste content format when there's no frontmatter node anchoring the document start.

The `looks_like_markdown` check in `pick_paste_mode` uses `LIST_REGEX = /(^|\n)\s{0,3}([-*+]|\d+\.)\s+\S/` which only matches top-level list markers (0-3 spaces indent). Deeply indented list items (4+ spaces) may fail this check, causing the paste to fall through to the HTML path or plain text, which loses nesting structure.

### Fix Plan

**File:** `src/lib/features/editor/adapters/markdown_paste_plugin.ts`

1. **Widen `LIST_REGEX` in `pick_paste_mode`** to detect indented list items (allow arbitrary leading whitespace, not just 0-3 spaces):

   ```
   LIST_REGEX = /(^|\n)\s*([-*+]|\d+\.)\s+\S/
   ```

2. **Improve `open_depth` for nested lists.** Add a case: if the pasted content is a single list (even with nesting), and the cursor is inside a list, use `open_depth = 2` to merge into the current list context. Current `is_single_flat_list_item` is too restrictive — add `is_single_list_block` that allows nested children.

3. **Add test cases** for:
   - Pasting indented list into empty doc (no front matter)
   - Pasting indented list before a code block
   - Pasting nested list into an existing list
   - Pasting nested list into a paragraph

**Files touched:**

- `src/lib/features/editor/adapters/markdown_paste_plugin.ts` — open_depth logic
- `src/lib/features/editor/adapters/markdown_paste_utils.ts` — LIST_REGEX
- `tests/` — new paste test file

---

## BUG-002: Source editor dirty state lost on tab switch

### Root Cause Analysis

The research confirms two distinct sub-issues:

**A. Content loss on tab switch:** The `source_editor_content.svelte` component is wrapped in `{#key open_note.meta.id}`, so switching tabs **destroys the entire CodeMirror view**. The `onDestroy` handler does flush pending content:

```ts
onDestroy(() => {
  if (store_timer !== null) {
    clearTimeout(store_timer);
    on_markdown_change(get_content()); // flush
  }
  view?.destroy();
});
```

However, `capture_active_tab_snapshot` in `tab_action_helpers.ts` calls `services.editor.flush()` **before** the Svelte component's `onDestroy` fires (because `flush()` is called imperatively during the tab switch action, while `onDestroy` fires when the DOM updates reactively). If the 50ms debounce timer hasn't fired yet and `flush()` reads from `source_content_getter`, this should work — but there may be a race where `source_content_getter` has already been cleared.

**B. Undo history lost:** CodeMirror state (including undo history) is destroyed on every mode switch and tab switch. Unlike ProseMirror which has `buffer_map` to cache `EditorState`, there is no equivalent for CodeMirror.

### Fix Plan

**Sub-fix A: Ensure content is always flushed before tab switch**

**File:** `src/lib/features/editor/adapters/source_editor_content.svelte`

1. Register a `beforeDestroy`-equivalent by hooking into the editor store's tab-switch signal. Specifically, ensure `EditorService.flush()` reads from `source_content_getter` while it's still valid. Add a guard in `flush()` to also read the debounced pending content:

   ```ts
   // In flush(), if source mode and getter exists, cancel any pending timer
   // and read directly from the getter
   ```

2. **Verify the flush ordering** in `capture_active_tab_snapshot`. The call to `services.editor.flush()` should work because `source_content_getter` is still registered at that point (it's cleared in `onDestroy`, which fires later). Add a defensive check: if `source_content_getter` returns the same value as `open_note.markdown`, skip the update to avoid unnecessary dirty marking.

**Sub-fix B: Cache CodeMirror state across tab switches**

**File:** `src/lib/features/editor/application/editor_service.ts` (new CM buffer cache)
**File:** `src/lib/features/editor/ui/source_editor_content.svelte`

1. Add a `cm_buffer_map: Map<string, EditorState>` to `EditorService` (parallel to ProseMirror's `buffer_map`).
2. On source editor destroy, save the CM `EditorState` (which includes undo history) to `cm_buffer_map` keyed by note path.
3. On source editor mount, check `cm_buffer_map` for a cached state. If found, initialize CM with the cached state instead of a fresh `doc: initial_markdown`.
4. Invalidate cache entries when a note is saved to disk or reloaded externally.

**Files touched:**

- `src/lib/features/editor/ui/source_editor_content.svelte` — save/restore CM state
- `src/lib/features/editor/application/editor_service.ts` — cm_buffer_map
- `src/lib/features/tab/application/tab_action_helpers.ts` — verify flush ordering
- `tests/` — tab switch round-trip tests

---

## BUG-003: Front matter parsing issues; text captured as front matter

### Root Cause Analysis

New documents are created with front matter via `build_initial_frontmatter()` in `ensure_open_note.ts`:

```ts
`---\ntitle: "${title}"\ndate_created: ${date}\n---\n\n`;
```

The ProseMirror schema places `frontmatter` as a `group: "block"` node. There is **no schema constraint** that `frontmatter` must be the first child of `doc` — it's just a block node. The `doc` content spec is `block+`, so a `frontmatter` node could theoretically appear anywhere in the document, or multiple times.

**Problem scenario:** When a user starts typing in a blank document (which has a frontmatter node + empty paragraph), if the cursor somehow lands inside the frontmatter node (which is `display:none`), keystrokes append to the frontmatter's text content. Since the node is hidden, the user can't see this happening. The paragraph guarantee in `mdast_to_pm` only adds an empty paragraph if there's no body — but if the document already has a paragraph, the guarantee doesn't trigger.

The `frontmatter` node has `code: true` which means ProseMirror treats it as a code node (no marks, raw text). It does NOT have `isolating: true` or `atom: true`, which means cursor navigation can enter it.

### Fix Plan

**Phase 1: Prevent cursor from entering hidden frontmatter node**

**File:** `src/lib/features/editor/adapters/schema.ts`

1. Add `isolating: true` to the `frontmatter` NodeSpec. This prevents cursor from crossing into the frontmatter node via arrow keys.
2. Add `selectable: false` so the node can't be selected by clicking (though it's `display:none`, keyboard nav could still reach it).

**File:** `src/lib/features/editor/adapters/` (new plugin or extension)

3. Add a ProseMirror plugin with `filterTransaction` or `appendTransaction` that prevents the selection from landing inside a `frontmatter` node. If the selection resolves inside frontmatter, redirect it to the first body paragraph.

**Phase 2: Collapse instead of hide (UX improvement)**

**File:** `src/lib/features/editor/adapters/schema.ts`
**File:** `src/lib/features/editor/ui/` (new frontmatter widget or node view)

4. Replace `display:none` with a collapsible node view:
   - Collapsed by default: shows a small `---` indicator or "Front Matter" chip
   - Click to expand: reveals the YAML content in a code-like editor
   - This makes front matter visible for debugging without cluttering the editing experience
5. This is a larger UX change — implement after Phase 1 stabilizes the cursor issue.

**Phase 3: Consolidate front matter parsers (systemic)**

There are currently **three independent parsers** with subtly different behavior:

| Parser                 | Location              | Mechanism                         | Used By              |
| ---------------------- | --------------------- | --------------------------------- | -------------------- |
| remark-frontmatter     | remark_processor.ts   | remark plugin, full spec          | ProseMirror pipeline |
| `FRONTMATTER_RE`       | frontmatter_writer.ts | Regex `^---[ \t]*\n([\s\S]*?)---` | Metadata mutations   |
| `indexOf("\n---\n")`   | frontmatter_sync.ts   | String search                     | Reference sync       |
| `starts_with("---\n")` | service.rs, db.rs     | Line scanning                     | Rust blurb/search    |

**Differences that can cause bugs:**

- Regex allows trailing whitespace on `---` fences; indexOf does not
- Regex uses non-greedy `[\s\S]*?` (matches first `---`); indexOf also finds first `\n---\n`
- Rust parser treats any line equal to `"---"` as a fence closer (no position constraint)
- None validate that the YAML content is actually valid YAML before treating it as front matter

**Fix:**

1. Extract a single canonical `parse_frontmatter(markdown: string): { yaml: string; body: string; has_frontmatter: boolean }` utility
2. Strict rules: opening `---` must be at byte offset 0, closing `---` must be on its own line, YAML must parse without error (or fall back to treating entire content as body)
3. Migrate `frontmatter_writer.ts` and `frontmatter_sync.ts` to use this utility
4. Add comprehensive edge-case tests: empty doc, `---` only, `---\n---`, `--- \n`, nested `---` in body, etc.

**Files touched:**

- `src/lib/features/editor/adapters/schema.ts` — isolating, selectable
- `src/lib/features/editor/adapters/` — cursor guard plugin
- `src/lib/features/editor/ui/` — collapsible node view (Phase 2)
- `src/lib/features/metadata/domain/frontmatter_writer.ts` — migrate to shared parser
- `src/lib/features/reference/domain/frontmatter_sync.ts` — migrate to shared parser
- New: `src/lib/shared/domain/frontmatter_parser.ts` — canonical parser
- `tests/` — frontmatter edge-case tests

---

## BUG-004: Pasted link produces malformed markup

### Root Cause Analysis

The paste pipeline processes clipboard content through `pick_paste_mode()`:

1. `text/markdown` present → "markdown"
2. `text/plain` looks like markdown → "markdown"
3. `text/html` present → "html" (→ `html_to_markdown()` → remark parse)
4. Otherwise → "none" (ProseMirror default)

**Problem:** When pasting a URL, the clipboard typically contains:

- `text/plain`: `https://example.com`
- `text/html`: `<a href="https://example.com">https://example.com</a>` (browser-generated)

The `looks_like_markdown` check does **not** detect bare URLs, so it falls to the HTML path. `html_to_markdown()` converts the `<a>` to markdown. But if the HTML also contains an image preview or the URL points to an image, the conversion might produce `![](url)` alongside `[text](url)`, resulting in `<url>![](url)`.

The `<url>` part suggests remarkGfm's **autolink literal** parsing is producing an autolink node from a bare URL that wasn't properly wrapped, and it's colliding with an image node from the HTML conversion.

The cascade failure (lists, fences, headings breaking) indicates the malformed node corrupts the ProseMirror document tree. A broken `frontmatter`-less document (per BUG-001/003 context) may compound this — if the first node is malformed, the parser can't recover cleanly.

### Fix Plan

**Step 1: Investigate and fix `html_to_markdown` for URL-only clipboard**

**File:** `src/lib/features/editor/adapters/markdown_paste_utils.ts`

1. Add a `looks_like_url` check in `pick_paste_mode` — if `text/plain` is a single bare URL (matches `https?://\S+`), handle it directly as a link insertion rather than going through the HTML→markdown pipeline.

2. Add a dedicated paste handler for bare URLs: create a `link` mark wrapping the URL text, insert directly as a ProseMirror node. This bypasses remark entirely for this common case.

**Step 2: Fix HTML→markdown conversion for link-heavy content**

**File:** `src/lib/features/editor/adapters/html_to_markdown.ts` (or wherever `html_to_markdown` lives)

3. Audit the HTML→markdown conversion for edge cases where `<a>` tags produce doubled output (both autolink and explicit link syntax). Ensure the converter strips autolink syntax when an explicit `[text](url)` is already present.

**Step 3: Add resilience to document tree corruption**

**File:** `src/lib/features/editor/adapters/markdown_paste_plugin.ts`

4. After parsing the pasted content via remark and converting to PM nodes, validate the resulting `Slice` before inserting. If the slice contains nodes that violate the schema (e.g., text content at the doc level), wrap them in paragraphs.

5. Add a `try/catch` around the `replaceSelection` dispatch — if the transaction throws or produces an invalid doc, fall back to inserting as plain text.

**Files touched:**

- `src/lib/features/editor/adapters/markdown_paste_utils.ts` — URL detection
- `src/lib/features/editor/adapters/markdown_paste_plugin.ts` — URL handler, validation
- `src/lib/features/editor/adapters/html_to_markdown.ts` — audit conversion
- `tests/` — URL paste tests

---

## Priority & Sequencing

| Order | Bug             | Severity | Effort | Rationale   |
| ----- | --------------- | -------- | ------ | ----------- | ---------------------------------------------------------------------- |
| 1     | BUG-003 Phase 1 | High     | Small  | **Done**    | Cursor guard prevents data corruption.                                 |
| 2     | BUG-003 Phase 3 | High     | Medium | **Done**    | Consolidating parsers eliminates a class of bugs.                      |
| 3     | BUG-002A        | High     | Small  | **Done**    | Flush ordering fix prevents data loss on tab switch.                   |
| 4     | BUG-004         | High     | Medium | **Done**    | Paste corruption is user-visible and breaks editing.                   |
| 5     | BUG-001         | High     | Medium | **Done**    | List paste fix depends on understanding the full paste pipeline.       |
| 6     | BUG-002B        | Medium   | Medium | **Partial** | CM content cache added. Full undo history deferred.                    |
| 7     | BUG-003 Phase 2 | Low      | Large  | Dropped     | Not needed — cursor guard + canonical parser resolved the root causes. |

---

## Testing Strategy

All fixes should include:

1. **Unit tests** for the specific parsing/detection logic (regex changes, frontmatter parser, URL detection)
2. **Integration tests** simulating paste events with controlled clipboard data
3. **Round-trip tests** for source ↔ visual mode transitions with dirty state
4. **Edge-case tests** for frontmatter: empty docs, malformed fences, cursor positioning

Test files (actual):

- `tests/unit/domain/frontmatter_parser.test.ts` — 18 tests for canonical parser
- `tests/unit/domain/markdown_paste_utils.test.ts` — 24 tests for paste mode detection
- `tests/unit/domain/frontmatter_writer.test.ts` — 53 existing tests (all passing with migrated parser)

---

## Implementation Summary (2026-04-08)

### Files Created

- `src/lib/shared/domain/frontmatter_parser.ts` — canonical frontmatter parser
- `src/lib/features/editor/adapters/frontmatter_guard_plugin.ts` — cursor guard plugin
- `tests/unit/domain/frontmatter_parser.test.ts` — parser tests
- `tests/unit/domain/markdown_paste_utils.test.ts` — paste utils tests

### Files Modified

- `src/lib/features/editor/adapters/schema.ts` — `isolating: true`, `selectable: false`
- `src/lib/features/editor/extensions/core_extension.ts` — wired guard plugin
- `src/lib/features/editor/adapters/markdown_paste_plugin.ts` — URL handling, nested lists, try/catch
- `src/lib/features/editor/adapters/markdown_paste_utils.ts` — widened LIST_REGEX, `is_bare_url`, "url" mode
- `src/lib/features/editor/ui/source_editor_content.svelte` — fixed flush ordering
- `src/lib/features/editor/state/editor_store.svelte.ts` — `cm_content_cache`
- `src/lib/features/metadata/domain/frontmatter_writer.ts` — migrated to shared parser
- `src/lib/features/reference/domain/frontmatter_sync.ts` — migrated to shared parser

### Deferred

- **BUG-002B undo history:** Requires not destroying CM on tab switch (architectural)
- **BUG-003 Phase 2:** Dropped — cursor guard + canonical parser resolved the root causes

### Verification

- `pnpm check` — 0 errors
- `pnpm test` — 2427 tests pass (all existing + 42 new)
- `pnpm lint` — no new errors
- `cargo check` — passes
