# Visual Editor Formatting Assessment

**Date:** 2026-05-19
**Status:** Assessment complete, pending implementation decision

## Problem Statement

Several formatting operations in the visual editor are inconvenient to modify after creation. Users cannot append to inline code spans, cannot change heading levels without delete-and-recreate, and generally lose control over formatting once markdown delimiters are consumed by input rules.

## Root Cause

The core issue is **`inclusive: false` on formatting marks** combined with delimiter-consuming input rules and no re-entry mechanism.

### The asymmetry in schema.ts

| Mark | `inclusive` | Extend by typing at boundary? | Escape mechanism |
|------|-------------|-------------------------------|------------------|
| `strong` | `true` (default) | Yes | Ctrl+B toggle |
| `em` | `true` (default) | Yes | Ctrl+I toggle |
| `code_inline` | **`false`** | **No** | ArrowRight (escape plugin) |
| `strikethrough` | **`false`** | **No** | ArrowRight (escape plugin) |
| `highlight` | **`false`** | **No** | ArrowRight (escape plugin) |
| `link` | `false` | No | (correct — links should not bleed) |

Bold and italic work well because they're inclusive: typing at the boundary extends the mark, and users escape via toggle shortcuts (Ctrl+B/I). This is standard rich-text-editor behavior.

Code, strikethrough, and highlight are non-inclusive. Typing at the boundary always falls *outside* the mark. Combined with input rules consuming delimiters, this creates **write-once formatting**: once created, you can modify interior characters but cannot extend the boundary.

The `mark_escape_plugin` (`mark_escape_plugin.ts`) reinforces this — it provides escape FROM non-inclusive marks via ArrowRight at boundaries, but there is no corresponding re-entry mechanism.

### Concrete symptoms

1. **Cannot append to inline code**: Cursor at end of `` `code` `` span → new characters fall outside the mark. No way to extend.
2. **Cannot change heading level**: `#` characters consumed by `textblockTypeInputRule` in `block_input_rules_plugin.ts`. Only way to change level is via formatting toolbar commands (`heading1`/`heading2`/`heading3`) or delete-and-recreate.
3. **Formatting feels "sticky"**: Input rules eagerly convert delimiters, and the resulting marks cannot be easily manipulated at their boundaries.

## Proposed Fix: Uniform inclusive marks + universal escape

### Principle

All formatting marks should be inclusive (extend when typing at boundary). All formatting marks should release on ArrowRight past the boundary. One rule, not per-mark special cases.

### Changes required

**1. `schema.ts` — Remove `inclusive: false` from formatting marks**

```typescript
// BEFORE
const code_inline: MarkSpec = {
  priority: 100,
  code: true,
  inclusive: false,  // ← remove
  ...
};

const strikethrough: MarkSpec = {
  inclusive: false,  // ← remove
  ...
};

const highlight: MarkSpec = {
  inclusive: false,  // ← remove
  ...
};

// KEEP inclusive: false on link — links genuinely should not bleed
```

**2. `mark_escape_plugin.ts` — Escape from ALL formatting marks, not just non-inclusive**

Current logic filters for `inclusive === false` marks only:
```typescript
const non_inclusive = marks.filter(
  (m) => m.type.spec.inclusive === false,
);
if (non_inclusive.length === 0) return false;
```

Change to: escape from all formatting marks (excluding `ai_generated` and similar non-user-facing marks) on ArrowRight at a mark boundary.

### Resulting behavior

- Typing at the end of a code/strikethrough/highlight span → extends the mark (matches bold/italic)
- ArrowRight at the boundary → escapes the mark (preserved, now universal)
- Copy/paste → unchanged (round-trips through markdown serialization)
- Input rules → unchanged (still consume delimiters and create marks)

### What this does NOT fix

**Heading level editing** is a separate issue (block-level, not mark-level). Fix independently:
- Add keybindings: `Ctrl+1` through `Ctrl+6` (or `Cmd+` on Mac) to set heading level
- Optionally: detect `#` typed at position 0 of a heading and adjust the `level` attr

## Relevant files

| File | Role |
|------|------|
| `src/lib/features/editor/adapters/schema.ts` | Mark specs with `inclusive` settings (lines 740–808) |
| `src/lib/features/editor/adapters/mark_escape_plugin.ts` | ArrowRight escape from non-inclusive marks |
| `src/lib/features/editor/adapters/inline_mark_input_rules_plugin.ts` | Input rules that consume delimiters and create marks |
| `src/lib/features/editor/adapters/paired_delimiter_plugin.ts` | Paired delimiter handling (backtick, `*`, `=`, `~`) |
| `src/lib/features/editor/adapters/heading_keymap_plugin.ts` | Heading Backspace→paragraph and Enter-past-fold |
| `src/lib/features/editor/adapters/block_input_rules_plugin.ts` | Block-level input rules including `heading_rule` |
| `src/lib/features/editor/adapters/formatting_toolbar_commands.ts` | Toolbar commands for heading level, mark toggles |
| `src/lib/features/editor/extensions/marks_extension.ts` | Assembles mark-related plugins |

## Risks and considerations

- **Code mark `code: true` interaction**: ProseMirror's `code: true` on a mark disables other marks inside it and affects input handling. This is independent of `inclusive` — making code_inline inclusive does not change the "no nested marks" behavior.
- **User expectation shift**: After the change, typing at the end of a code span will produce code-formatted text. Users must learn to ArrowRight to escape. This matches how bold/italic already work and is standard in rich-text editors.
- **Testing**: Verify that the input rule → mark creation → typing → escape flow works smoothly for all affected marks. Check that paste behavior is unchanged.

## Alternative approaches (deferred)

For reference, more substantial options were considered and deferred:

- **Obsidian-style delimiter reveal**: Show markdown delimiters when cursor is near a formatted span. High complexity, better as a future enhancement.
- **Hybrid per-node rendering**: Reveal delimiters only for the focused element. Medium-high complexity.

These are worth revisiting if the inclusive-marks fix doesn't fully resolve user friction.
