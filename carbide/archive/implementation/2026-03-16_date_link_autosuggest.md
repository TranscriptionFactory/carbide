# Date Link Auto-Suggest — Sprint Notes (2026-03-16)

## Problem

No quick way to insert date-based wiki links while editing. Users want to type `@today` and get `[[2026-03-16]]` inserted.

## Solution

New ProseMirror plugin triggered by `@` character that shows a floating popup with date presets (Today, Tomorrow, Yesterday). Selection inserts a `[[YYYY-MM-DD]]` wiki link.

## Changes

### Editor plugin

- **`src/lib/features/editor/adapters/date_suggest_plugin.ts`** (new): `$prose()` plugin with:
  - `handleTextInput`: Activates on `@` at word boundary (preceded by whitespace or line start). Skips code_block and math_block nodes.
  - Plugin state: `active`, `from`, `query`, `selected_index`, `items`.
  - `handleKeyDown`: ArrowUp/Down for navigation, Enter to select, Escape to dismiss.
  - Floating popup via `SlashProvider` from `@milkdown/kit/plugin/slash` (same positioning system as slash commands).
  - Inserts `[[YYYY-MM-DD]]` wiki link replacing `@` trigger text.
  - Exports `generate_date_presets(now)` and `extract_date_trigger(state)` for testing.

### Registration

- **`src/lib/features/editor/adapters/milkdown_adapter.ts`**: Added `.use(date_suggest_plugin)` after typography plugin.

### Tests

- **`tests/unit/adapters/date_suggest_plugin.test.ts`** (new): Tests for `generate_date_presets` (correct dates, YYYY-MM-DD formatting) and query filtering.

## Design Decisions

- **@-trigger vs slash command**: @ works mid-line unlike / which requires line-start. Separate plugin avoids complicating the slash command infrastructure.
- **Preset menu vs date picker**: 3 presets (Today/Tomorrow/Yesterday) covers the common case. Full date picker would be disproportionate complexity.
- **Wiki link format**: `[[YYYY-MM-DD]]` matches existing wikilink resolution. Daily notes can be created by following the link.
