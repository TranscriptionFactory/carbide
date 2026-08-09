# Source ↔ Visual Editor Switch: Link Loss & Undo Queue Research

**Date:** 2026-04-30
**Branch:** `fix/nodeview-collapse-focus`
**Related:** `carbide/2026-04-30_bug_research.md` (same editor infrastructure)

---

## Bug A: Incomplete Links Destroyed on Mode Switch

### Symptoms

- Type an incomplete link in source editor (e.g., `[text](`, `[text](http`)
- Switch to visual editor
- Switch back to source editor
- The link syntax is gone — replaced with escaped text like `\[text]\(`

### Root Cause

The mode switch pipeline is:

```
Source editor → flush() → store.markdown → parse_markdown() → PM doc → serialize_markdown() → store.markdown
```

The critical step is `parse_markdown()`, which runs the remark unified pipeline:

```
remarkParse → remarkGfm → custom plugins → mdast_to_pm()
```

**Remark does not recognize incomplete link syntax as a link node.** Tested directly:

| Input | Remark parses as | Round-trip output |
|-------|-----------------|-------------------|
| `[text](` | literal text | `\[text]\(` |
| `[text](http` | literal text | `\[text]\(http` |
| `[text](http://example.com` | autolink (GFM) | `\[text]\(<http://example.com>)` |
| `[text]()` | link (empty href) | `[text]()` |
| `[broken]( more text` | literal text | `\[broken]\( more text` |

Remark treats `[` and `(` as special characters and **escapes them** when they don't form a complete link. This is correct CommonMark behavior — but it means incomplete links are **irrecoverably transformed** during the parse-serialize round-trip.

### The Exact Flow

1. User types `[text](http://partial` in source editor
2. User switches to visual mode → `flush()` saves raw markdown to store
3. `sync_visual_from_markdown()` calls `session.set_markdown(markdown)`
4. Inside `set_markdown()`: `parse_markdown(markdown)` runs remark
5. Remark sees `[text](http://partial` → not a valid link → treats as text with literal `[`, `]`, `(`
6. `mdast_to_pm()` creates a text node with the escaped content
7. PM doc now contains plain text, no link mark
8. User switches back to source → `flush()` serializes PM doc → `pm_to_mdast()` → `remark-stringify`
9. `remark-stringify` escapes the `[` and `(` → output: `\[text]\(http://partial`
10. Original link syntax is permanently mangled

### Key Files

| File | Role |
|------|------|
| `src/lib/features/editor/adapters/markdown_pipeline.ts` | `parse_markdown()` — entry point |
| `src/lib/features/editor/adapters/remark_plugins/remark_processor.ts` | Remark pipeline config |
| `src/lib/features/editor/adapters/mdast_to_pm.ts:41-54` | Link deserialization (only reached for valid links) |
| `src/lib/features/editor/adapters/pm_to_mdast.ts` | Link serialization |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | `set_markdown()` — mode switch entry |
| `src/lib/app/orchestration/app_actions.ts` | `editor_toggle_mode` action |

### Solution Space

**Option 1: Pre-process incomplete links before parsing**
Detect patterns like `[text](` via regex and temporarily complete them (→ `[text]()`) so they survive remark. Problem: no clean way to mark them as "was incomplete" on the PM side — user now sees a valid link with empty href in visual mode, which is misleading.

**Option 2: Don't round-trip if user hasn't edited in visual mode**
Keep the raw source markdown as the authoritative string when switching *back* to source, rather than re-serializing from PM. Only re-serialize if the user made visual-mode edits. This preserves the exact source text for "peek at visual → go back" workflows.

**Option 3: Warn/block the switch**
Detect incomplete link syntax before switching and warn the user: "You have incomplete markdown syntax that will be lost. Continue?" Least invasive but worst UX.

**Option 4: Treat as acceptable behavior**
Incomplete syntax is by definition not valid markdown. The editor's job is to parse valid markdown. Document the limitation. Most users complete links before switching.

### Recommendation

**Option 2** is the strongest. The key insight: `set_markdown()` currently replaces the PM doc with `addToHistory: false`, meaning the PM doc is fully replaced every time the user switches to visual. If the user switches back *without editing in visual mode*, the store should return the original source string, not a re-serialized version.

Implementation sketch:
- Track a `visual_edited_since_switch` flag on the editor session
- On source→visual switch, store the raw source markdown as `pre_switch_source`
- On visual→source switch:
  - If `visual_edited_since_switch` is false → use `pre_switch_source` (no remark round-trip)
  - If true → serialize from PM as today (lossy, but user made visual edits so they've "accepted" the parsed form)

This doesn't fix the case where the user edits in visual mode, but that's a deliberate action — the user chose to interact with the parsed document.

---

## Bug B: Undo Queue Not Shared Between Editors

### Symptoms

- Make edits in visual mode, switch to source mode → Cmd-Z does nothing (source editor has empty history)
- Make edits in source mode, switch to visual mode → Cmd-Z undoes *pre-switch visual edits*, not source edits
- Source-mode edits are never undoable in visual mode and vice versa

### Root Cause

The two editors use completely independent undo systems:

| Editor | Undo system | Lifecycle |
|--------|------------|-----------|
| Visual (ProseMirror) | `prosemirror-history` plugin | Survives mode switches (PM editor is hidden via CSS, not destroyed) |
| Source (CodeMirror 6) | CM6 built-in history (from `basicSetup`) | Destroyed on every switch away (Svelte `{#if}` block unmounts the component) |

### The Exact Flow

**Visual → Source:**
1. `flush()` serializes PM doc to markdown, saves to store
2. Source editor mounts fresh with `initial_markdown` from store
3. Source editor's CodeMirror state is brand new → **empty undo stack**
4. PM editor is hidden (`display: none`) → its history plugin **survives intact**

**Source → Visual:**
1. `flush()` extracts CodeMirror content via `source_content_getter()`, saves to store
2. `sync_visual_from_markdown()` calls `session.set_markdown(markdown)`
3. `set_markdown()` dispatches `replaceWith` transaction with `addToHistory: false`
4. Source edits are applied to PM doc but **not recorded in PM history**
5. Source editor component is **destroyed** (Svelte unmount) → CodeMirror state and history are **garbage collected**
6. If user presses Cmd-Z in visual mode, PM history replays *pre-switch visual edits* (not source edits)

### `addToHistory: false` Justification

The mode-switch content replacement uses `addToHistory: false` because:
- The entire PM doc is replaced atomically (one `replaceWith` transaction)
- If this were in history, a single Cmd-Z would revert the *entire document* to pre-switch state, losing all source edits
- This is the correct behavior for "external content sync" — but it means source edits are invisible to PM history

### Key Files

| File | Role |
|------|------|
| `src/lib/features/editor/extensions/core_extension.ts` | PM `history()` plugin setup |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | `set_markdown()` with `addToHistory: false` |
| `src/lib/features/note/ui/note_editor.svelte` | Svelte `{#if}` that destroys source editor |
| `src/lib/features/editor/ui/source_editor_content.svelte` | Source editor mount/unmount lifecycle |
| `src/lib/features/editor/domain/source_editor_sync.ts` | Source↔store sync |

### Solution Space

**Option 1: Persist CodeMirror state across switches (preserve per-mode history)**
Instead of destroying the source editor on mode switch, persist its `EditorState` (which includes history). On re-mount, restore from the saved state rather than creating fresh. Each mode has its own undo stack, but it survives switches.

- Pros: Simple, no cross-model translation needed, each editor undoes its own edits
- Cons: Doesn't truly share history — visual undoes visual, source undoes source. Users may still be confused that Cmd-Z "skips" edits from the other mode.

**Option 2: Unified operation log with bidirectional mapping**
Maintain a single undo stack that translates operations between PM and CM representations. When the user presses Cmd-Z, the operation is replayed in whichever model is currently active.

- Pros: True unified undo — Cmd-Z always undoes the last edit regardless of mode
- Cons: Extremely complex. PM operations (node transforms, mark toggles) and CM operations (text insertions/deletions) are fundamentally different representations. Would need a bidirectional mapping layer. Essentially what CRDT/Yjs does, but for single-user undo.

**Option 3: Clear both stacks on switch (explicit reset)**
When switching modes, clear the undo history in the new mode and show a subtle indicator ("Undo history reset"). The user knows Cmd-Z won't reach across modes.

- Pros: Simple, honest UX
- Cons: Loses PM history that currently survives switches (regression for visual-mode users who peek at source and come back)

**Option 4: Hybrid — persist per-mode history + visual indicator**
Combine Option 1 with a subtle UI cue. Each mode preserves its own history. When switching, show "Undo history: [N visual edits] / [M source edits]" or simply grey out the undo button if the current mode has no history.

### Recommendation

**Option 1 (persist CM state)** is the pragmatic choice. True unified undo (Option 2) is architecturally disproportionate. The key change:

1. In `note_editor.svelte`, change the source editor from `{#if}` (mount/unmount) to always-mounted + `hidden` (like the PM editor already works)
2. Or: store `EditorState` in the editor session and restore it on re-mount

The first approach is simpler but keeps both editors in the DOM. The second is cleaner — only one editor is DOM-mounted at a time, but the CM state is preserved in memory.

Either way, the user gets: "Cmd-Z in source mode undoes source edits" and "Cmd-Z in visual mode undoes visual edits" — each mode remembers its own history across switches.

---

## Summary

| Bug | Root Cause | Fix Complexity | Recommendation |
|-----|-----------|----------------|----------------|
| A: Link loss | Remark doesn't parse incomplete links; round-trip escapes them | Medium | Track `visual_edited_since_switch`; skip re-serialize on no-edit round-trips |
| B: Undo not shared | Independent undo stacks; CM state destroyed on switch | Low–Medium | Persist CM `EditorState` across mode switches |

Both bugs stem from the same architectural choice: the source editor is ephemeral (created/destroyed on each switch) while the visual editor is persistent (hidden/shown). Making the source editor's state equally persistent would address Bug B directly and enable the `pre_switch_source` tracking needed for Bug A.

### Implementation Order

1. **Persist CM state** (fixes Bug B, enables Bug A fix)
2. **Track visual edits + skip re-serialize** (fixes Bug A)
3. **Tests**: mode-switch round-trip with incomplete syntax, undo across switches
