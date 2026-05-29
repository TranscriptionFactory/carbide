# Plan: Expose Editor Max-Width as Adjustable Theme Token

## Problem

Editor width/margins are controlled inconsistently across themes:

- **Some themes** use `--editor-max-width` CSS variable (monolith, command-deck, zen-deck)
- **Some themes** hardcode values (theater: `120ch`, spotlight: `80ch`)
- **Source editor** (CodeMirror) hardcodes `maxWidth: "48rem"` in TS
- **Zen mode** hardcodes `72ch` in Svelte component

Users cannot adjust editor width via settings because hardcoded values bypass the `token_overrides` mechanism.

## Current State Audit

| Theme            | Prose Editor                                         | Source Editor           | Uses Token?   |
| ---------------- | ---------------------------------------------------- | ----------------------- | ------------- |
| **default**      | `--editor-max-width: min(85ch, 90%)` in `editor.css` | `48rem` hardcoded in TS | Partial       |
| **theater**      | `120ch` hardcoded in CSS                             | `48rem` hardcoded in TS | No            |
| **spotlight**    | `80ch` hardcoded in CSS                              | `48rem` hardcoded in TS | No            |
| **monolith**     | `--editor-max-width: 72ch`                           | `48rem` hardcoded in TS | Yes (partial) |
| **command-deck** | `--editor-max-width: 95ch`                           | `48rem` hardcoded in TS | Yes (partial) |
| **zen-deck**     | `--zen-max-width: 100ch` (separate var)              | `48rem` hardcoded in TS | No            |
| **zen mode**     | `72ch` hardcoded in Svelte                           | `48rem` hardcoded in TS | No            |

## Proposed Changes

### 1. Standardize `--editor-max-width` across all theme CSS files

**Files to modify:**

- `src/styles/theme-theater.css` — replace `max-width: 120ch` with `max-width: var(--editor-max-width)` and add `--editor-max-width: 120ch` as the theme default
- `src/styles/theme-spotlight.css` — replace `max-width: 80ch` with `max-width: var(--editor-max-width)` and add `--editor-max-width: 80ch` as the theme default
- `src/styles/theme-zen-deck.css` — rename `--zen-max-width` to `--editor-max-width` (value stays `100ch`)
- `src/styles/theme-monolith.css` — already uses token, no CSS change needed
- `src/styles/theme-command-deck.css` — already uses token, no CSS change needed

### 2. Expose source editor max-width as CSS variable

**File:** `src/lib/features/editor/ui/source_editor_theme.ts`

Change `.cm-content` from:

```ts
".cm-content": {
  maxWidth: "48rem",
  margin: "0 auto",
}
```

To:

```ts
".cm-content": {
  maxWidth: "var(--source-editor-max-width, 48rem)",
  margin: "0 auto",
}
```

### 3. Add `--source-editor-max-width` defaults per theme

Add to theme CSS files where the source editor should differ from prose:

- `src/styles/editor.css` — add default `--source-editor-max-width: 48rem` to `:root`
- `src/styles/theme-theater.css` — add `--source-editor-max-width: 48rem` (or match prose width if desired)

### 4. Fix zen mode hardcoded value

**File:** `src/lib/app/bootstrap/ui/workspace_layout.svelte`

Change the zen mode style from:

```css
.WorkspaceLayout--zen :global(.cm-editor) {
  max-width: 72ch;
  margin-inline: auto;
}
```

To use the token:

```css
.WorkspaceLayout--zen :global(.cm-editor) {
  max-width: var(--editor-max-width);
  margin-inline: auto;
}
```

And add `--editor-max-width: 72ch` override for zen mode in the appropriate CSS.

### 5. Document token usage

Update `docs/architecture.md` or relevant docs to note:

- `--editor-max-width` controls prose editor column width
- `--source-editor-max-width` controls source/code editor column width (falls back to `48rem`)
- Both can be set via `token_overrides` in custom themes

## How Users Will Adjust Editor Width

After this refactoring, users can:

1. **Duplicate a builtin theme** (Settings → Theme → Duplicate)
2. **Open Advanced panel** in theme settings
3. **Add token override** in the custom theme JSON:
   ```json
   {
     "token_overrides": {
       "--editor-max-width": "60ch",
       "--source-editor-max-width": "40rem"
     }
   }
   ```

Or programmatically via the theme update API.

## Scope & Impact

| File                                                | Change                                  | Risk |
| --------------------------------------------------- | --------------------------------------- | ---- |
| `src/styles/theme-theater.css`                      | Add var, replace hardcoded              | Low  |
| `src/styles/theme-spotlight.css`                    | Add var, replace hardcoded              | Low  |
| `src/styles/theme-zen-deck.css`                     | Rename var                              | Low  |
| `src/styles/editor.css`                             | Add `--source-editor-max-width` default | Low  |
| `src/lib/features/editor/ui/source_editor_theme.ts` | Use CSS var for maxWidth                | Low  |
| `src/lib/app/bootstrap/ui/workspace_layout.svelte`  | Use CSS var for zen mode                | Low  |

**No breaking changes** — all existing themes retain their visual appearance since we're defining the CSS variable with the same hardcoded value as the default.

## Testing

- Visual regression: verify each theme renders identically before/after
- Token override: create custom theme with `--editor-max-width: 50ch` and verify it applies
- Source editor: verify `--source-editor-max-width` override works
- Zen mode: verify zen mode still constrains correctly
