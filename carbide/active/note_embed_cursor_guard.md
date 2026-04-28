# Note Embed: Cursor Guard Heuristic

## Problem

`![[]]` auto-brackets place the cursor inside: `![[|]]`. Typing a single character produces `![[x]]`, which matches `NOTE_EMBED_REGEX` and triggers immediate conversion to a `note_embed` node — before the user can pick from the wiki suggest dropdown.

The root cause is a ProseMirror lifecycle ordering issue: `appendTransaction` (where the embed plugin converts paragraphs) runs **before** the suggest plugin's `update()` view hook (where it sets `active: true`). So the embed plugin can't check `wiki_suggest_plugin_key.getState(new_state)?.active` — it's still `false` at that point.

## Current Fix

`note_embed_plugin.ts` — cursor-position heuristic in the non-full-scan path:

```ts
const text = collect_paragraph_text(parent);
if (text) {
  const cursor_offset = $from.parentOffset;
  const close_idx = text.indexOf("]]");
  if (close_idx !== -1 && cursor_offset <= close_idx) return null;
}
```

If the cursor is at or before `]]`, skip conversion. This works because:

- **Typing inside brackets:** cursor is before `]]` -> skip
- **Suggest accept:** places cursor after `]]` -> converts
- **Full scan (load/sync):** takes a separate code path, no cursor check

## Ideal Fix

Replace the cursor-position heuristic with an explicit signal. Two options:

### Option A: Accept-triggered conversion

The wiki suggest `accept` handler already knows when a note embed was completed (it has `current_is_embed`). It could dispatch a meta on the transaction that the embed plugin listens for:

```ts
// In wiki_suggest accept handler:
if (current_is_embed) {
  tr.setMeta(note_embed_plugin_key, { action: "convert_at_cursor" });
}

// In note_embed appendTransaction:
// Only convert in typing path if meta says so (or full_scan)
```

This removes the heuristic entirely. Conversion only happens on explicit accept or full scan. Trade-off: wiki suggest gains awareness of note embeds (one import).

### Option B: Shared "composing" state

Add a lightweight composing signal (e.g. a dedicated `PluginKey` or a field on editor context) that any suggest plugin sets synchronously in `apply()` rather than asynchronously in `update()`. Other plugins can then check it in `appendTransaction`.

This is more general but adds infrastructure for a single use case — likely over-engineered unless other plugins need the same pattern.

### Recommendation

Option A is the cleanest path. It's explicit, minimal (a few lines in two files), and eliminates the heuristic. Worth doing if the cursor guard ever causes edge-case issues.

## Commit Reference

- `85e6ca51` — current cursor-position guard
- `fa0fc2d3` — wiring fixes (lazy adapter, prod ports, full scan)
