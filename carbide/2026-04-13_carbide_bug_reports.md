
## High-confidence findings from the review

A few items already have strong likely causes:

1. **Manual vault re-index failure**
   - In `src-tauri/src/features/search/db.rs`, manual reindex deletes from:
     - `notes.path`
     - `notes_fts.path`
     - `outlinks.source_path`
     - `note_links.path`
     - `note_inline_tags.path`
     - `note_sections.path`
   - But for `note_headings`, it currently does:
     - `DELETE FROM note_headings WHERE path NOT LIKE '@linked/%'`
   - The table uses **`note_path`**, not `path`.
   - This is almost certainly the direct cause of:
     - `no such column: path in DELETE FROM note_headings ...`

2. **Bases crash on task column click / wrong parameter count**
   - In `src-tauri/src/features/search/db.rs`, `query_bases()` builds `ORDER BY` correctly for task aggregate columns, but still appends a sort parameter whenever the sort field is “not direct”.
   - That means task aggregate sorts like `task_count` can end up with **an extra bound parameter even though the SQL contains no placeholder**, which matches:
     - `Wrong number of parameters passed to query. Got 1, needed 0`
   - This is very likely the crash the report mentions for clicking the task column.

3. **Save pill / dirty state not registering smart-link insert actions**
   - Suggested link insertion routes through:
     - `src/lib/features/links/application/links_actions.ts`
   - That action calls:
     - `editor_service.insert_text(\`[[${title}]]\`)`
   - `EditorService.insert_text()` currently only does:
     - `this.session?.insert_text_at_cursor(text);`
   - It does **not** explicitly mark dirty.
   - If the underlying session/plugin path doesn’t synchronously propagate dirty state for this action, the save indicator can lag or miss the change.

Those three should be first, because they’re concrete and likely low-risk.

---

# Concrete implementation plan

## Phase 1 — Fix the deterministic backend bugs first

### 1. Fix manual vault re-index SQL for `note_headings`
**Priority:** P0  
**Files:**
- `src-tauri/src/features/search/db.rs`

**Implementation**
- Update the manual reindex delete statement to use `note_path` instead of `path` for `note_headings`.
- Audit the nearby cleanup block for any other schema-name mismatches.
- Add a regression test that exercises the manual cleanup/reindex path with linked and non-linked notes present.

**Why first**
- This is an outright broken code path.
- The fix is surgical and should be safe.

**Acceptance criteria**
- Manual reindex no longer throws the SQL error.
- Non-linked headings are cleared and rebuilt.
- `@linked/...` headings are preserved when intended by the cleanup strategy.

**Tests**
- Add Rust test in the `search/db.rs` test suite covering the cleanup path.
- Verify `note_headings` rows are deleted using `note_path`, not `path`.

---

### 2. Fix Bases sort parameter handling for task aggregate columns
**Priority:** P0  
**Files:**
- `src-tauri/src/features/search/db.rs`
- `src/lib/features/bases/ui/bases_table.svelte`
- optionally `src/lib/features/bases/ui/bases_panel.svelte`

**Implementation**
- In `query_bases()`, only append the extra sort parameter when the `ORDER BY` clause actually uses a placeholder.
- Current logic treats “not direct” as “needs parameter”; that is too broad.
- Change it to:
  - no extra param for direct columns
  - no extra param for task aggregate columns
  - extra param only for custom property sorts

**Secondary pass**
- Confirm whether the report meant **task** column or **tag** column.
- The current table only makes **task** sortable; the tags header is not clickable.
- So the parameter-count crash is almost certainly the **Tasks** column.

**Acceptance criteria**
- Clicking the Tasks header sorts without error.
- Sorting by a custom property still works.
- Sorting by title / mtime / task_count all work with correct ascending/descending toggles.

**Tests**
- Add Rust tests for:
  - sort by `task_count`
  - sort by `tasks_done`
  - sort by `next_due_date`
  - sort by custom property
- Add a small frontend test if there is existing coverage around Bases UI interactions.

---

## Phase 2 — Fix editor transaction correctness (dirty state + undo)

> **Design constraint:** Items 3 and 4 share the same transaction surface.
> The wiki_link_plugin's `appendTransaction` sets both `addToHistory: false`
> and `mark_clean` on normalization transforms. A naive dirty-state fix in
> item 3 (e.g., bolting on a side-channel `set_dirty` call) would be
> immediately undermined by the plugin re-marking clean on the follow-up
> transaction. Both items must be designed together.

### 3. Fix `EditorService.insert_text()` to participate in dirty state
**Priority:** P1
**Files:**
- `src/lib/features/editor/application/editor_service.ts`

**Root cause (verified)**
- Every other method in `EditorService` that calls `session.insert_text_at_cursor()`
  also explicitly calls `this.editor_store.set_dirty(open_note.meta.id, true)`:
  - `apply_ai_output` (lines 283, 294, 300, 311)
- `insert_text()` (line 232–234) is the sole outlier — it calls
  `this.session?.insert_text_at_cursor(text)` and nothing else.
- The `dirty_state_plugin` in ProseMirror *does* fire `on_dirty_state_change(true)`
  when `docChanged`, but every other call site still adds an explicit `set_dirty`
  as belt-and-suspenders. `insert_text` should follow the same pattern.

**Why the ProseMirror plugin alone is insufficient**
- When `insert_text(“[[Title]]”)` is called, the PM transaction fires and
  sets dirty = true via the plugin callback. But immediately after,
  `wiki_link_plugin.appendTransaction` fires a follow-up transform that
  sets `mark_clean` + `addToHistory: false` (line 255–256). This can
  race with or override the dirty state before the UI observes it.
- The explicit `set_dirty` call in the service is what the other code paths
  rely on to survive this — it sets dirty state at the store level *after*
  the PM dispatch cycle completes, not inside the plugin callback chain.

**Implementation**
- Add explicit `set_dirty` to `insert_text()`, matching the pattern in
  `apply_ai_output`. This is the minimal correct fix:
  ```ts
  insert_text(text: string) {
    const open_note = this.editor_store.open_note;
    if (!open_note) return;
    this.session?.insert_text_at_cursor(text);
    this.editor_store.set_dirty(open_note.meta.id, true);
  }
  ```
- This is safe because:
  - It follows the established pattern exactly
  - It does not introduce a new mechanism
  - It does not interact with undo history
  - The `mark_clean` from wiki_link_plugin only fires within
    `appendTransaction`, which runs *during* the PM dispatch. The
    explicit `set_dirty` at the service level runs *after*.

**What NOT to do**
- Do not make dirty state “automatic” inside `insert_text_at_cursor` at the
  adapter level. The adapter is a low-level session primitive; dirty
  semantics belong in the service layer.
- Do not try to fix the `wiki_link_plugin`'s `mark_clean` behavior here.
  That is item 4's scope.

**Acceptance criteria**
- Clicking “Insert wiki-link” in suggested links:
  - updates editor content
  - marks the note dirty immediately
  - causes the save indicator/pill to reflect unsaved changes
- Saving clears the dirty state normally afterward.
- Works in both visual and source mode.

**Tests**
- Unit test for `links_insert_suggested_link` action + editor service integration.
- Editor-focused test covering programmatic `insert_text()` and dirty flag transitions.

---

### 4. Undo/redo correctness audit and stabilization
**Priority:** P1
**Scope:** Timeboxed investigation + two concrete fixes. Not a rewrite.

**Files:**
- `src/lib/features/editor/extensions/core_extension.ts`
- `src/lib/features/editor/adapters/formatting_toolbar_commands.ts`
- `src/lib/features/editor/adapters/wiki_link_plugin.ts`
- `src/lib/features/editor/adapters/prosemirror_adapter.ts`

#### 4a. Fix toolbar undo/redo divergence from keyboard (concrete, do first)

**Problem (verified)**
- `core_extension.ts` correctly switches between `yUndo`/`yRedo` and
  `pmUndo`/`pmRedo` based on `use_yjs` (lines 27–29).
- `formatting_toolbar_commands.ts` hardcodes `import { undo, redo } from
  “prosemirror-history”` (line 4) and uses those directly (lines 52–55).
- When Yjs is active, keyboard `Mod-z` uses `yUndo` but toolbar undo
  uses `pmUndo`. These are different undo stacks — toolbar undo will
  either no-op or undo something unexpected.

**Fix**
- `formatting_toolbar_commands.ts` should not own its undo/redo
  implementation. Instead, it should delegate to the same command the
  keymap uses.
- Options (in order of preference):
  1. Accept the undo/redo command as a parameter from the caller that
     already knows `use_yjs`.
  2. Read the active undo command from a shared plugin key set by
     `core_extension.ts`.
- Either way, remove the direct `prosemirror-history` import from
  `formatting_toolbar_commands.ts`.

#### 4b. Audit `wiki_link_plugin` mark_clean semantics (investigation, timebox)

**Problem (verified)**
- `wiki_link_plugin.appendTransaction` (line 255) sets `mark_clean` on
  every normalization transform, even when the triggering transaction was
  a user edit that *should* leave the document dirty.
- The intent appears to be: “the wiki-link visual transform is a
  normalization, not a user edit, so it shouldn't make the document
  dirty by itself.” But the `mark_clean` is unconditional — it also
  cleans up dirtiness from the *triggering* user transaction.

**Investigation scope (timeboxed)**
- Determine whether `mark_clean` in appendTransaction actually overrides
  the service-level `set_dirty` in practice, or whether the explicit
  `set_dirty` calls in `apply_ai_output` etc. already survive it.
- If the plugin's `mark_clean` is effectively a no-op because
  service-level `set_dirty` always wins, document that and move on.
- If it *does* cause observable bugs, the fix is to change the
  appendTransaction to *not set dirty state meta at all* (neither clean
  nor dirty) — let dirty state be purely a function of whether the
  underlying content has changed, not of individual transactions.

#### 4c. Catalog appendTransaction history behavior (document, don't fix yet)

**Plugins that set `addToHistory: false`:**
- `wiki_link_plugin.ts` (line 256) — normalization transform
- `file_embed_plugin.ts` (line 134) — embed resolution
- `excalidraw_embed_plugin.ts` (line 79) — embed resolution
- `prosemirror_adapter.ts` (line 538) — external markdown sync

**Assessment:** These are all correct uses of `addToHistory: false` —
they are background normalizations, not user edits. No action needed
unless specific undo bugs are reproduced against one of these.

**What NOT to do**
- Do not attempt a full undo rewrite or try to merge the yjs/pm
  history stacks.
- Do not change `addToHistory: false` on normalization plugins unless
  a specific undo bug is reproduced against them.
- Do not add an “undo repro matrix” as a blocking prerequisite.
  Fix 4a (toolbar divergence) first, then investigate 4b. The repro
  matrix is a QA checklist, not a code prerequisite.

**Acceptance criteria**
- 4a: Toolbar undo/redo uses the same undo implementation as keyboard
  shortcuts, regardless of `use_yjs` setting.
- 4b: Document whether `mark_clean` in wiki_link_plugin causes
  observable dirty-state bugs post item-3 fix. Fix if yes, close if no.
- 4c: Catalog is documented (this section serves as the catalog).

**Tests**
- 4a: Test that toolbar undo command matches keyboard undo command.
- 4b: Integration test for insert `[[link]]` → verify dirty state
  survives wiki_link_plugin normalization.
- General: insert suggested link → undo removes it.

---

## Phase 3 — Fix linked-source path identity and deduplication

### 5. Stop linked sources from re-adding when only absolute path representation changes
**Priority:** P1  
**Files:**
- `src/lib/features/reference/application/reference_service.ts`
- `src/lib/features/reference/domain/linked_source_paths.ts`
- linked-source port implementation on backend, depending on where metadata is persisted

**What the current code suggests**
- `scan_linked_source()` uses `external_file_path` as the primary identity when building:
  - `current_files`
  - `existing_by_path`
- There is recovery logic using:
  - `vault_relative_path`
  - `home_relative_path`
  - `resolve_linked_path()`
  - `enrich_meta_with_paths()`
- But the note identity still appears too anchored to the current absolute path string, which is fragile if the same file is reachable via different absolute roots in a shared cloud folder setup.

**Implementation**
- Define a canonical identity strategy for linked files.
- Preferred order:
  1. stable vault-relative path when the file is inside the vault
  2. stable home-relative path when applicable
  3. absolute path only as fallback
- Refactor scan reconciliation so “same file, different absolute path representation” resolves as metadata update, not remove+re-add.
- Ensure relocation flows update the canonical identity consistently.

**Key change**
- The dedupe/reconciliation key in `scan_linked_source()` should not rely solely on `external_file_path`.

**Acceptance criteria**
- If a linked source remains the same underlying file but its absolute path representation changes, the app updates metadata instead of re-importing/re-adding it.
- Existing annotations/linked metadata remain attached.
- Re-scan is idempotent.

**Tests**
- Unit tests for `resolve_linked_path()` / `enrich_meta_with_paths()`.
- Service test for scan reconciliation:
  - existing absolute path changes
  - vault-relative/home-relative path still resolves to the same file
  - no duplicate linked note is produced

---

## Phase 4 — Expand Bases operator support cleanly

### 6. Add missing Bases expression/query operators, especially negated contains
**Priority:** P2  
**Files:**
- `src/lib/features/bases/ui/bases_panel.svelte`
- `src/lib/features/bases/ports.ts`
- `src-tauri/src/features/search/model.rs` or equivalent query model file
- `src-tauri/src/features/search/db.rs`

**Implementation**
- Extend the operator model instead of overloading current semantics.
- Add explicit operators such as:
  - `not_contains`
  - potentially `not_matches`
  - maybe `is_empty` / `is_not_empty` if useful and already consistent with Bases scope
- Update UI operator dropdown and backend SQL generation together.
- For tags, decide whether semantics are:
  - exact tag equality
  - descendant/prefix-aware tag matching
- For content/property contains, use consistent case-sensitivity rules.

**Important**
- Don’t bolt this into the UI only.
- Define one operator vocabulary shared between frontend and backend.

**Acceptance criteria**
- “doesn’t contain” works for:
  - direct columns
  - custom properties
  - tags, if supported
- Invalid operator/property combinations fail gracefully instead of crashing.

**Tests**
- Rust tests for each new operator against:
  - direct fields
  - custom properties
  - task aggregate fields where applicable
- UI test for filter creation and persisted query shape.

---

## Phase 5 — Search input UX cleanup

### 7. Turn off auto-correct/autocomplete behavior in search surfaces
**Priority:** P2  
**Files likely involved:**
- `src/lib/features/search/ui/omnibar.svelte`
- `src/lib/features/search/ui/find_in_file_bar.svelte`
- any other query/search input surfaces under `src/lib/features/search/ui/`
- possibly shared `Input` component if a reusable prop path is cleaner

**Current state**
- Query UI already disables spellcheck in some places.
- `omnibar.svelte` and `find_in_file_bar.svelte` appear to use plain text inputs without explicit anti-autocorrect attributes.

**Implementation**
- Add the usual search-safe attributes:
  - `spellcheck="false"`
  - `autocorrect="off"`
  - `autocapitalize="off"`
  - `autocomplete="off"`
- Apply only to search/query surfaces, not normal note editing.

**Acceptance criteria**
- Search inputs do not auto-correct or auto-capitalize.
- No regression in focus or keyboard navigation.

**Tests**
- Lightweight component tests are enough here, if the repo has coverage for attribute assertions.
- Otherwise include manual QA checklist.

---

## Phase 6 — Clipboard whitespace-token investigation

### 8. Investigate copied `&#x20;` whitespace token leakage
**Priority:** P3  
**Files likely involved:**
- `src/lib/features/editor/adapters/prosemirror_adapter.ts`
- `src/lib/features/editor/adapters/markdown_pipeline.ts`
- `src/lib/features/editor/adapters/remark_plugins/remark_processor.ts`
- any HTML/entity conversion helpers involved in PM ↔ markdown conversion

**Current likely surface**
- Clipboard copy goes through `clipboardTextSerializer` in `prosemirror_adapter.ts`.
- Non-code selections serialize through `serialize_markdown()`.
- The issue sounds like an entity-encoded whitespace token is leaking during markdown stringify or a node transformation edge case.

**Implementation**
- Reproduce with a minimal document containing:
  - leading whitespace
  - empty line between blocks
  - copied partial block selection
- Determine whether the artifact originates from:
  - ProseMirror slice normalization
  - PM → mdast conversion
  - mdast → markdown stringify
- Fix at the lowest stable layer.
- Avoid patching with brittle post-string replacements unless the issue is strictly serializer-local and well bounded.

**Acceptance criteria**
- Copying the affected content no longer emits `&#x20;`.
- Empty lines and leading spaces preserve intended plain-text semantics.
- Code block copying remains unaffected.

**Tests**
- Serializer-level test for the repro case.
- Clipboard serialization test for plain text selection.

---

# Recommended execution order

## Sprint 1 — Surgical backend + editor dirty-state fixes ✅ COMPLETED
1. ✅ Reindex SQL fix (item 1) — `note_path` column fix in manual reindex DELETE
2. ✅ Bases task-column sort fix (item 2) — skip extra sort param for task_agg columns
3. ✅ `insert_text` dirty-state fix (item 3) — added `set_dirty` matching `apply_ai_output` pattern
4. ✅ Toolbar undo/redo divergence fix (item 4a) — auto-detect yjs via `yUndoPluginKey` in editor state

All four are concrete, high confidence, low risk. Item 3 is a one-line
fix that follows the existing pattern. Item 4a is a small wiring fix.
These two are grouped with Sprint 1 because they're just as surgical
as items 1–2.

**Verified:** `pnpm check` (0 errors), `cargo check` (clean), `pnpm test` (3227/3227 pass), `pnpm format` (clean).

## Sprint 2 — Investigation + design-heavy items
5. wiki_link_plugin `mark_clean` investigation (item 4b) — timeboxed
6. Linked-source dedupe/path canonicalization (item 5)

Item 4b may resolve to "no action needed" once item 3 is in place.
Item 5 requires a design decision on canonical identity before coding.

## Sprint 3 — Lower urgency
7. Bases operator expansion (item 6)
8. Search autocorrect off (item 7) — drive-by, do anytime
9. Clipboard whitespace-token investigation (item 8)

---

# Test plan by layer

## Rust/backend
Focus in `src-tauri/src/features/search/db.rs` tests:
- manual cleanup/reindex regression for `note_headings`
- `query_bases()` sorting:
  - direct column
  - task aggregate column
  - custom property
- new operators if added

## Frontend/unit
Focus in top-level `tests/`:
- editor service dirty-state transitions for programmatic `insert_text()`
- links action → editor insertion → dirty flag
- toolbar undo/redo uses same command as keyboard (4a)
- dirty state survives wiki_link_plugin normalization after `insert_text("[[link]]")` (4b)
- insert suggested link → undo removes it
- search input attributes for omnibar/find bar

## Manual QA checklist
- manual reindex from UI
- Bases:
  - add filter
  - sort by Tasks
  - save/load view
- suggested links:
  - insert link
  - save pill updates
  - undo/redo works
- linked sources:
  - same file under changed absolute path
  - no duplicate re-import
- copy selected text with leading space / blank line

---

# Suggested issue breakdown

If you want these tracked as implementation tickets, I’d split them into:

1. **Fix search DB manual reindex cleanup for note headings**
2. **Fix Bases aggregate sorting param binding**
3. **Fix `EditorService.insert_text()` dirty-state gap**
4a. **Fix toolbar undo/redo to use same command as keyboard**
4b. **Investigate wiki_link_plugin `mark_clean` interaction with dirty state** (may close as no-action)
5. **Canonicalize linked-source identity across path changes**
6. **Add negated Bases operators**
7. **Disable autocorrect in search inputs**
8. **Investigate clipboard whitespace entity leakage**