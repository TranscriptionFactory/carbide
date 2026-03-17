# Typographic Auto-Substitution — Sprint Notes (2026-03-16)

**Bug tracker ref:** `CARBIDE_BUGS.md` #9
**Branch:** `feat/typographic-substitution`

## Problem

Users want common character sequences to auto-convert to their typographic equivalents while typing:
- `-->` → `→`, `<--` → `←`, `<->` → `↔`
- `==>` → `⇒`, `<==` → `⇐`, `<=>` → `⇔`
- `---` → `—` (em dash)
- `...` → `…` (ellipsis)

## Design Decisions

### Pattern: `handleTextInput` (not `InputRule`)

Used the same `handleTextInput` prop pattern as `emoji_plugin.ts` rather than ProseMirror `InputRule`. Reasons:
1. Character-by-character interception avoids regex compilation overhead
2. Natural code block / math block exclusion via parent node type check
3. Consistent with existing codebase conventions

### Em dash uses `---` not `--`

Using three hyphens avoids a conflict with `-->` arrow substitution. If `--` triggered em dash, typing `-->` would first convert `--` to `—` before the `>` arrives, breaking the arrow pattern. Three hyphens is also the standard Markdown convention for horizontal rules and is used by many editors (iA Writer, Typora) for em dash.

### Dropped `!=`, `>=`, `<=` operators

These conflict with double-arrow patterns (`<==`, `<=>`) and are extremely common in code/math contexts where substitution would be unwanted. The code block exclusion helps but inline code references in prose would still be affected.

## Implementation

### New files
- `src/lib/features/editor/adapters/typography_plugin.ts` — Plugin + pure matching function
- `tests/unit/adapters/typography_plugin.test.ts` — 16 test cases

### Modified files
- `src/lib/features/editor/adapters/milkdown_adapter.ts` — Import + `.use(typography_plugin)` registration

### Architecture
- `find_typography_match(text_before, typed_char)` — Pure function, exported for testability
- `typography_plugin` — `$prose()` wrapped ProseMirror plugin with `handleTextInput`
- Rules defined as a static `TYPOGRAPHY_RULES` array for easy extension
- Skips `code_block` and `math_block` parent nodes

## Testing

16 test cases covering:
- All 8 substitution patterns
- Start-of-text edge cases
- No-match scenarios (unrecognized patterns, partial patterns)
- Pattern priority (longer patterns match before shorter ones)
