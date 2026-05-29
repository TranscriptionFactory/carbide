# Bug Reports — 2026-04-23

---

## 1. AI Panel Doesn't Focus Current Note (Stays Stuck on First Note)

### Severity: Medium | Type: Bug

### Root Cause

The `$effect` in `ai_assistant_panel.svelte` (line 34-39) bails out when the session's `note_path` doesn't match the currently open note:

```ts
// ai_assistant_panel.svelte:34-39
const current_note = stores.editor.open_note;
if (!current_note || session.context?.note_path !== current_note.meta.path) {
  return; // silently does nothing on note switch
}
```

When the user switches notes, paths diverge, the effect returns early, and the session context is **never updated** to the new note. There is no code path that automatically re-initializes the AI session when the active note changes while the panel is open.

### Key Files

| File | Lines | Issue |
|---|---|---|
| `src/lib/features/ai/ui/ai_assistant_panel.svelte` | 34-39 | Path-mismatch guard suppresses context update on note switch |
| `src/lib/features/ai/application/ai_actions.ts` | 112-152 | `open_ai_dialog` only refreshes context if `note_path` matches; no auto-reinit on switch |

### How It Happens

1. User opens AI panel on Note A → session context stamps Note A's path/title/markdown.
2. User switches to Note B → `stores.editor.open_note` updates reactively.
3. Panel's `$effect` fires, sees `session.context.note_path (A) !== current_note.meta.path (B)`, returns early.
4. AI panel still shows Note A's context. User must manually re-invoke `ai_open_assistant` to reset.

### Fix Direction

Add a reactive effect (or modify the existing one) that detects when `open_note.meta.path !== session.context.note_path` and re-initializes the session context for the new note. Either:
- (a) Invert the guard in the panel's `$effect` to handle note switches by calling a context-reset action.
- (b) Add a separate `$effect` that watches for path divergence and calls `open_ai_dialog()` or equivalent.

---

## 2. Copy-Paste Broken (M2 Mac / Tauri WKWebView)

### Severity: High | Type: Bug

### Root Cause

The custom `handlePaste` in `markdown_paste_plugin.ts` defers **plain text** paste to ProseMirror's default handler, which may not work reliably in Tauri's WKWebView on M2 Macs.

The paste mode decision logic in `markdown_paste_utils.ts` (line 40-46):

```ts
export function pick_paste_mode(input: PasteModeInput): PasteMode {
  if (input.text_markdown.trim() !== "") return "markdown";
  if (is_bare_url(input.text_plain)) return "url";
  if (looks_like_markdown(input.text_plain)) return "markdown";
  if (input.text_html.trim() !== "") return "html";
  return "none"; // <-- plain text lands here, handler returns false
}
```

When mode is `"none"`, the plugin returns `false` and ProseMirror's internal fallback handles the paste. On M2/WKWebView, this fallback path may silently fail.

Additionally, **no `clipboardTextParser`** is provided to the `EditorView` constructor (`prosemirror_adapter.ts` line ~394), so ProseMirror uses its internal parser for plain-text paste, which is the likely failure point in WKWebView.

### Key Files

| File | Lines | Issue |
|---|---|---|
| `src/lib/features/editor/adapters/markdown_paste_utils.ts` | 40-46 | `pick_paste_mode` returns `"none"` for plain text |
| `src/lib/features/editor/adapters/markdown_paste_plugin.ts` | 49 | Returns `false` on "none" mode, deferring to ProseMirror default |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | ~394 | No `clipboardTextParser` override provided |

### What's NOT the Problem

- No `Mod-v` keybinding override exists (checked `core_extension.ts` and `use_keyboard_shortcuts.svelte.ts`).
- Image paste (`image_paste_plugin.ts`) only handles image files and correctly returns `false` for non-images.
- The clipboard adapter only exposes `write_text`, no read — paste is DOM-event-only, which is correct.

### Fix Direction

1. **Primary:** Add a `clipboardTextParser` prop to the `EditorView` constructor that handles plain text by parsing it through `parse_markdown` (or inserting as text nodes directly).
2. **Alternative:** Extend `pick_paste_mode` to return `"plain"` (new mode) instead of `"none"` for plain text, and handle it explicitly in the plugin by inserting as text content — never deferring to ProseMirror's default handler in WKWebView.

---

## 3. "Make Next Week Note" (Feature Request)

### Type: Feature Request

### Current State

No periodic/weekly note system exists. Note creation always uses `Date.now()` and the template system (`format_note_name.ts`) only supports `%Y/%m/%d/%H/%M/%S` tokens — no week-based tokens.

### Existing Infrastructure That Can Be Reused

- **`parse_natural_date.ts`** has `next_weekday(today, day)` (line 44-51) and `generate_date_presets()` — covers "next Monday" through "next Friday".
- **`format_note_name.ts`** — strftime-style template expansion, easy to extend.
- **`note_actions.ts` / `note_service.ts`** — `create_new_note(open_titles, template)` accepts `now_ms` which controls the date used.

### Implementation Path

1. **`format_note_name.ts`** — Add `%V` (ISO week number) and optionally `%u` (ISO day of week) tokens. Add a `get_iso_week(date)` helper.
2. **`note_actions.ts`** — Add a `note_create_next_week` action that computes `now_ms` as start-of-next-week (next Monday) and passes it to `create_new_note`.
3. **`action_ids.ts`** — Register the new action ID.
4. **UI** — Wire to a keyboard shortcut or command palette entry.
5. **Settings** — Optionally add a "Weekly Note Template" setting (e.g., `Weekly %Y-W%V`) alongside the existing `default_note_name_template`.

---

## 4. File Save in Different Folder Does Not Work

### Severity: Medium | Type: Bug

### Root Cause

`FolderSuggestInput` only calls `on_change` inside `commit()`, which is only triggered by:
- Dropdown item click
- Enter key (when dropdown is open with items)
- Tab key completion

**`on_change` is never called on blur or plain text input.** If a user types a folder path without selecting from the dropdown, the value is never committed to the store.

### Key Files

| File | Lines | Issue |
|---|---|---|
| `src/lib/components/ui/folder_suggest_input.svelte` | 36-42, 86-100 | `on_change` only in `commit()`; not on blur or raw input |
| `src/lib/features/note/ui/save_note_dialog.svelte` | 67-72 | `update_filename` uses `folder_path` prop (stale if folder was typed but not committed) |
| `src/lib/features/note/application/note_actions.ts` | 221-239, 863-879 | `open_save_note_dialog` initializes from sidebar selection; `note_update_save_folder` only fires when `on_change` is called |

### How It Happens

1. User opens save dialog → `folder_path` initialized from sidebar selection (or empty).
2. User **types** a different folder path but doesn't select from dropdown.
3. Focus moves to filename field → `on_blur` fires but does NOT call `on_change`.
4. `update_filename` reconstructs full path using the **stale** `folder_path` from the store.
5. Note saves to wrong location.

### Fix Direction

Call `on_change` on blur in `folder_suggest_input.svelte`:

```ts
function on_blur() {
  setTimeout(() => {
    show_dropdown = false;
    on_change(query.replace(/\/+$/, "")); // commit typed value on blur
  }, 150);
}
```

---

## 5. Dropped Images Can't Be Resized

### Severity: Medium | Type: Bug

### Root Cause

Two distinct image node types exist in the ProseMirror schema (`schema.ts`), and resize is exclusive to one:

- **`"image-block"` (lines 218-264):** Block-level, has `width` attribute, rendered in `.milkdown-image-block` wrapper. **Resize works.**
- **`"image"` (lines 266-303):** Inline, **no `width` attribute**, renders as bare `<img>`. **No resize.**

Dropped images are inserted as markdown text `![alt](path)` (via `note_action_helpers.ts` line 172 and `file_drop_plugin.ts` line 37), which parses to the inline `"image"` node. An `appendTransaction` plugin (`image_input_rule_plugin.ts`) is supposed to auto-promote solo inline images to `"image-block"`, but it may not fire reliably for inserted slices (selection position mismatch during `replaceSelection`).

### The Full Failure Chain

1. User drops image → `![alt](path)` text inserted via `insert_text_at_cursor`.
2. `parse_markdown` produces an `"image"` inline node inside a paragraph.
3. `image_input_rule_plugin.ts` converter may miss the promotion (position check doesn't match the inserted slice's paragraph).
4. Image stays as inline `"image"` → renders as plain `<img>`, no `.milkdown-image-block` wrapper.
5. `image_toolbar_plugin.ts` checks `target.closest(".milkdown-image-block")` → fails.
6. `image_width_plugin.ts` skips all non-`"image-block"` nodes.
7. Context menu `apply_resize` tries `setNodeMarkup` with `width` → schema strips it (no `width` attr on `"image"`).

### Key Files

| File | Lines | Issue |
|---|---|---|
| `src/lib/features/editor/adapters/schema.ts` | 218-303 | `"image"` has no `width` attr; `"image-block"` does |
| `src/lib/features/note/application/note_action_helpers.ts` | 147-205 | Drops insert `![alt](path)` → parses to inline `"image"` |
| `src/lib/features/editor/domain/file_drop_plugin.ts` | 37 | Internal drag-drop also returns `![alt](path)` |
| `src/lib/features/editor/adapters/image_input_rule_plugin.ts` | 22-53 | Converter may miss promotion for inserted slices |
| `src/lib/features/editor/adapters/image_extension.ts` | 101-183 | `"image"` node view has no wrapper/width; `"image-block"` does |
| `src/lib/features/editor/adapters/image_toolbar_plugin.ts` | 65-78 | Only targets `.milkdown-image-block` |

### Fix Direction (pick one)

1. **Insert as `"image-block"` directly:** Change drop/paste handlers to insert `"image-block"` nodes programmatically instead of markdown text. Most reliable.
2. **Fix the converter:** Ensure `image_input_rule_plugin.ts` reliably promotes images inserted via `replaceSelection` by checking the inserted range rather than relying on `$from.parent`.
3. **Unify nodes:** Add `width` to the `"image"` schema and extend toolbar/width plugins to handle both node types. Most effort, least clean.
