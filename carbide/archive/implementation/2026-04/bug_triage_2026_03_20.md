# Bug Triage Implementation Plan — 2026-03-20

## Issue 1: Frontmatter-only note traps cursor — no way to insert text below

### Problem

When a note consists only of a frontmatter block (no body content), the cursor is trapped inside the frontmatter NodeView. `FrontmatterNodeView.stopEvent()` returns `true` for all events, preventing ProseMirror from handling arrow keys, Tab, Enter, etc. The `gapCursor` plugin doesn't help because there's no sibling node to gap-cursor into — the doc has exactly one child (the frontmatter node) and no paragraph after it.

### Root cause

`frontmatter_plugin.ts:41` — `stopEvent()` unconditionally returns `true`. Combined with `ignoreMutation()` returning `true`, ProseMirror cannot create a selection outside the NodeView. When the document has no content node after the frontmatter, there's literally nowhere for the cursor to go.

### Fix

**A. Guarantee a paragraph after frontmatter on load/insert** (primary fix)

In `prosemirror_adapter.ts`, after parsing markdown into a ProseMirror doc, check: if the doc's first child is `frontmatter` and either it's the only child or the second child is empty, append an empty paragraph. Do this in two places:

1. **`parse_markdown()` output** — in the adapter's `load_note()` / doc creation path (`prosemirror_adapter.ts`), post-process the parsed doc to ensure a trailing paragraph exists after frontmatter.
2. **`insert_frontmatter()` command** — already inserts at pos 0, but should also check if doc only has the frontmatter and append a paragraph + set selection to it.

**B. Add a keymap plugin for frontmatter escape** (secondary UX improvement)

Create a small ProseMirror plugin (or extend the existing frontmatter plugin) that listens for `ArrowDown` / `Enter` when selection is at the end of the document and the current node is frontmatter. On trigger: insert a paragraph after the frontmatter node and move selection into it.

### Files to change

| File                                                      | Change                                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | Post-process parsed doc to guarantee paragraph after frontmatter; fix `insert_frontmatter()` to append paragraph + move selection |
| `src/lib/features/editor/adapters/frontmatter_plugin.ts`  | Add keymap handling: Enter/ArrowDown at end-of-doc escapes frontmatter by creating a paragraph below                              |

### Tests

- `tests/unit/editor/` — test that a markdown string with only frontmatter parses to a doc with frontmatter + empty paragraph
- Test `insert_frontmatter()` on an empty doc produces frontmatter + paragraph with cursor in paragraph
- Test ArrowDown from frontmatter-only doc creates paragraph

### Complexity: Low

---

## Issue 2: Tag exclusion — ability to exclude tags/documents from tag index

### Problem

Inline tags parsed via `INLINE_TAG_RE` (`(?:^|\s)#([\w][\w/-]*)`) in `src-tauri/src/shared/markdown_doc.rs:12` match `#2`, `#3` etc. in numbered lists or references like "item #2". These false positives pollute the tags panel and bases queries.

### Two sub-problems

1. **False positive tags**: `#2`, `#123` (pure numeric), `#1st` etc. should not be treated as tags
2. **User wants to exclude specific tags or documents from the tag index** (e.g. suppress `#2` even if valid)

### Fix

**A. Improve inline tag regex to reject numeric-only tags** (primary fix)

Change the regex in `markdown_doc.rs` from:

```
(?:^|\s)#([\w][\w/-]*)
```

to:

```
(?:^|\s)#([a-zA-Z_][\w/-]*)
```

This requires the first character after `#` to be a letter or underscore, not a digit. Matches Obsidian's behavior: `#2` is not a tag, `#v2` is.

**B. Add a tag exclusion list in vault settings** (secondary — user-controlled)

Add a `tag_exclusions: string[]` field to vault settings (persisted via `SettingsPort`). The Rust indexer reads this list and skips matching tags during `upsert_note_parsed`. The frontend tags panel also filters them out.

**C. Add per-document index exclusion** (optional — lower priority)

Support a frontmatter key like `exclude_from_index: true` or `tags_ignore: [foo, bar]` that the indexer respects. This lets users suppress indexing for specific notes or specific tags within a note.

### Files to change

| File                                     | Change                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/shared/markdown_doc.rs`   | Update `INLINE_TAG_RE` to require alpha/underscore first char                                                   |
| `src-tauri/src/features/search/db.rs`    | In `upsert_note_parsed_inner`, filter tags against exclusion list (read from vault settings or passed as param) |
| `src/lib/features/settings/types/`       | Add `tag_exclusions` to vault settings type                                                                     |
| `src/lib/features/tags/` (store/service) | Filter excluded tags on frontend side as backup                                                                 |

### Tests

- Rust unit test: `#2` no longer extracted as tag; `#v2`, `#project`, `#_internal` still work
- Rust unit test: tag exclusion list filters out specified tags
- Frontend: tags panel doesn't show excluded tags

### Complexity: Low–Medium

---

## Issue 3: Formatting — auto-closing pairs, highlight mode, image paste-to-assets

### Problem

The `carbide/obsidian_formatting_breaks_html.md` Section 1 describes Obsidian's auto-closing/completion behaviors:

- Bracket & quote pairing (`[`, `(`, `{`, `"`, `'` → auto-close)
- Markdown syntax pairing (`*`, `_`, `=`, `~`, `` ` `` → auto-pair for bold/italic/highlight/strike/code)
- Code fence auto-close (` ` ``` + Enter → closing fence)
- Type-through (typing closing char jumps over auto-generated one)
- Wrap selection (select text, type opener → wraps selection)

Currently Carbide has input rules for bold, italic, code, strikethrough (`inline_mark_input_rules_plugin.ts`, `strikethrough_plugin.ts`) but these are _conversion_ rules (type the full syntax → apply mark), not _pairing_ rules (type opener → auto-insert closer).

Additionally: image copy-paste already works via `image_paste_plugin.ts` which saves to assets. This part may already be complete — need to verify the save-to-assets path works correctly.

### Fix

**A. Implement bracket/quote auto-pairing plugin**

Create `src/lib/features/editor/adapters/auto_pair_plugin.ts` — a ProseMirror plugin with `handleKeyPress` that:

- On typing `[`, `(`, `{`, `"`, `'` → inserts pair and positions cursor between
- On typing closing char when next char is the auto-generated closer → "type through" (move cursor forward, don't insert)
- On typing `*`, `_`, `~`, `` ` ``, `=` → inserts pair (for markdown formatting)
- When text is selected and opener is typed → wraps selection

Reference: `prosemirror-inputrules` won't work for this; needs `handleTextInput` or `handleKeyDown` in a plugin's `props`.

**B. Code fence auto-close**

Extend `block_input_rules_plugin.ts` or create separate logic: when user types ` ``` ` + language + Enter, auto-insert closing ` ``` ` and place cursor on the line between.

**C. Highlight mark (`==text==`) support**

Verify the `mark` (highlight) node is in the ProseMirror schema. If not, add it. Add an input rule for `==text==` → highlight mark. The theme system already has `highlight_bg` and `highlight_text_color` tokens.

**D. Image paste → assets (verify/fix)**

`image_paste_plugin.ts` already handles paste → `on_image_paste_requested` → saves bytes. Verify the full flow saves to the vault's assets directory and inserts a markdown image link. If broken, fix the adapter path.

### Files to change

| File                                                                 | Change                                                           |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `src/lib/features/editor/adapters/auto_pair_plugin.ts`               | **New file**: auto-pairing for brackets, quotes, markdown syntax |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts`            | Register auto-pair plugin in plugin list                         |
| `src/lib/features/editor/adapters/block_input_rules_plugin.ts`       | Add code fence auto-close on Enter                               |
| `src/lib/features/editor/adapters/inline_mark_input_rules_plugin.ts` | Add highlight (`==`) input rule if not present                   |

### Tests

- Auto-pair: typing `[` produces `[]` with cursor between
- Type-through: typing `)` when next char is `)` moves cursor
- Selection wrapping: selecting "text" and typing `*` produces `*text*`
- Code fence: typing ` ```js ` + Enter creates fenced block with closing
- Highlight: typing `==foo==` applies highlight mark

### Complexity: Medium

---

## Issue 4: Theme JSON / code block theming — shiki theme not wired correctly, can't select themes

### Problem

Two sub-issues:

1. **Theme overrides don't apply to code blocks instantly** — `code_block_text_color` sets `--editor-code-block-text` CSS var via `apply_theme.ts:92`, but shiki decorations use inline `style="color:..."` from `shiki_plugin.ts:64` which overrides CSS custom properties. So `code_block_text_color` has no effect on syntax-highlighted code.
2. **No ability to select shiki themes** — hardcoded to `github-light` / `github-dark` in `shiki_highlighter.ts:74-75`. Users want to pick from shiki's theme catalog (e.g. dracula, one-dark-pro, catppuccin, nord, etc.).

### Root cause

Shiki decorations apply token colors via inline styles directly on `<span>` elements inside code blocks. These have highest CSS specificity, so CSS custom properties like `--editor-code-block-text` cannot override them. The two systems (theme tokens + shiki inline styles) are decoupled.

### Fix

**A. Add shiki theme selection to Theme type**

Add `shiki_theme_light: string` and `shiki_theme_dark: string` fields to the `Theme` type in `src/lib/shared/types/theme.ts`. Default to `"github-light"` / `"github-dark"`.

**B. Lazy-load shiki themes on demand**

Change `shiki_highlighter.ts` to:

- Keep the two default themes bundled (github-light, github-dark)
- When user selects a different theme, dynamically import it via `shiki/dist/themes/<name>.mjs`
- Load it into the highlighter via `highlighter.loadTheme()`
- Expose a `set_themes(light: string, dark: string)` function

**C. Wire theme selection through the reactor**

The `theme.reactor.svelte.ts` calls `apply_theme()` which sets `data-color-scheme`. The shiki plugin's `MutationObserver` already watches this and re-renders. Extend this:

- When shiki theme changes in the active `Theme`, dispatch a ProseMirror transaction with `shiki_plugin_key` meta to trigger re-highlight
- Add a new reactor or extend the existing one to call an editor method that updates the shiki theme

**D. Fix `code_block_text_color` to work as fallback**

For code blocks where shiki can't highlight (no language specified, unsupported language), the `--editor-code-block-text` CSS var should apply. This already works for unhighlighted code. For highlighted code, `code_block_text_color` is intentionally overridden by syntax highlighting — this is correct behavior. Document this clearly in the theme editor UI.

**E. Add theme picker UI in theme editor**

In the theme editor panel, add a dropdown for "Code Theme (Light)" and "Code Theme (Dark)" that lists available shiki themes. Popular subset to include:

Light: `github-light`, `one-light`, `catppuccin-latte`, `rose-pine-dawn`, `min-light`, `slack-ochin`
Dark: `github-dark`, `one-dark-pro`, `catppuccin-mocha`, `dracula`, `nord`, `rose-pine`, `tokyo-night`, `slack-dark`

### Files to change

| File                                                    | Change                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/shared/types/theme.ts`                         | Add `shiki_theme_light`, `shiki_theme_dark` fields to `Theme` type + defaults                            |
| `src/lib/features/editor/adapters/shiki_highlighter.ts` | Support dynamic theme loading; expose `set_themes()`, `get_available_themes()`                           |
| `src/lib/features/editor/adapters/shiki_plugin.ts`      | Accept theme name from external source (not just `data-color-scheme`); re-highlight on theme name change |
| `src/lib/shared/utils/apply_theme.ts`                   | Set a `data-shiki-theme` attribute or dispatch custom event when shiki theme fields change               |
| `src/lib/reactors/theme.reactor.svelte.ts`              | Trigger editor shiki theme update when theme's shiki fields change                                       |
| `src/lib/features/theme/ui/`                            | Add shiki theme picker dropdowns in theme editor                                                         |

### Tests

- Unit: `resolve_theme()` returns correct shiki theme name based on active Theme config
- Unit: `set_themes()` loads and registers new theme in highlighter
- Unit: theme reactor triggers shiki re-highlight on shiki theme change
- Integration: changing shiki theme in editor re-colors all code blocks

### Complexity: Medium

---

## Implementation Order

1. **Issue 1** (frontmatter cursor trap) — Smallest fix, highest annoyance. ~1 hour.
2. **Issue 2** (tag regex fix) — One-line regex change for the primary fix. ~30 min for regex, ~2 hours with exclusion list.
3. **Issue 4** (shiki theme selection) — Self-contained in editor/theme layers. ~4 hours.
4. **Issue 3** (auto-pairing) — Most new code, needs careful UX testing. ~4-6 hours.

## Scenarios & Edge Cases

### Issue 1

- Note with only `---\ntags: []\n---` and nothing else
- Note where frontmatter is followed by only whitespace
- Insert frontmatter command on a completely empty note
- Source mode toggle should still work as escape hatch

### Issue 2

- `#2` in "step #2 of the process" — must NOT be a tag
- `#v2` — valid tag
- `#2024-plan` — currently matched (starts with digit) — should NOT match with fix
- `#_internal` — valid tag (starts with underscore)
- Nested tags: `#project/carbide` — must still work
- Frontmatter `tags: [foo]` — unaffected (different parsing path)

### Issue 3

- Typing `[` inside a code block — should NOT auto-pair
- Typing `*` at start of line — could conflict with list input rule
- Auto-pair `"` vs typographic quote substitution — need clear precedence
- Undo after auto-pair should remove both characters

### Issue 4

- Theme with `code_block_text_color` set + shiki theme active — shiki wins for highlighted code, CSS var wins for plain code
- Switching from dark to light mode — both shiki theme and color scheme must update
- Custom theme with no shiki preference — falls back to github-light/dark
- Loading a shiki theme that doesn't exist — graceful fallback
