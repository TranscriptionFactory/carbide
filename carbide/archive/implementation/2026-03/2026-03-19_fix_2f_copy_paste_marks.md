---
title: "Fix 2F — Inline code formatting preserved on copy-paste"
date: 2026-03-19
status: implemented
bug_ref: "2F"
---

## Problem

Copying text with inline formatting (`` `code` ``, **bold**, _italic_) from the ProseMirror editor and pasting it back loses all marks — pastes as plain text.

## Root Cause

The `clipboardTextSerializer` in `prosemirror_adapter.ts` used `textBetween()` which extracts raw text without any mark information. The clipboard only received `text/plain` with no formatting syntax (e.g., `foo` instead of `` `foo` ``).

On paste, the markdown paste plugin checked for `text/markdown` (absent) and `looks_like_markdown()` on the plain text (which has no syntax markers). Since neither matched, ProseMirror's default paste handler inserted plain text without marks.

## Fix

Changed `clipboardTextSerializer` to serialize the copied slice as markdown instead of plain text:

```typescript
clipboardTextSerializer: (slice) => {
  const wrap = schema.topNodeType.create(null, slice.content);
  return serialize_markdown(wrap);
},
```

This wraps the slice content in a temporary doc node and serializes it via the existing `serialize_markdown()` pipeline, which preserves all inline marks as markdown syntax (backticks for code, `**` for bold, `*` for italic, etc.).

### How the round-trip works

1. **Copy**: `serialize_markdown` puts `` `foo` `` on clipboard as `text/plain`
2. **Paste**: `looks_like_markdown()` detects backticks via `INLINE_CODE_REGEX`
3. **Parse**: `markdown_paste_plugin` parses it back via `parse_fn`, restoring `code_inline` mark
4. **Insert**: `replaceSelection` inserts the parsed content with marks intact

Both `schema` and `serialize_markdown` were already in scope at the call site — no new imports needed.

## Files Changed

| File                                                      | Change                          |
| --------------------------------------------------------- | ------------------------------- |
| `src/lib/features/editor/adapters/prosemirror_adapter.ts` | Serialize clipboard as markdown |
