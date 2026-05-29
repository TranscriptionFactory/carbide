# Mdit Port Phase 1 & 2 — Code Review

**Last Updated:** 2026-04-17

---

## Executive Summary

Phases 1 and 2 are mostly clean and well-executed, but three specific problems undermine the work: one item in Phase 1 is confirmed pre-existing dead-code confusion, the fallback parse tests are nearly worthless as written, and Phase 2 added a `foldable` attribute to the callout schema that has zero implementation backing it — schema state that cannot round-trip meaningfully and will silently lose data.

The callout feature itself is the right call and well-structured. The drag handle additions are genuinely new and fit the existing plugin cleanly. The real waste is not in what was built but in the test quality and one schema attribute that was ported for parity-completeness without a matching implementation plan.

---

## Critical Issues

### 1. Foldable state on callout is inert but persisted in schema

**Files:** `schema.ts`, `callout_view_plugin.ts`, `remark_callout.ts`, `pm_to_mdast.ts`

**Severity:** Critical

The callout schema has three attrs: `callout_type`, `foldable`, and `default_folded`. The remark plugin parses these correctly from markdown (`[!tip]+` or `[!tip]-`). The PM-to-MDAST serializer writes them back. On paper this looks like a complete roundtrip.

The problem is that `CalloutBlockView` in `callout_view_plugin.ts` never reads `foldable` or `default_folded`. There is no click handler, no CSS toggle, no `aria-expanded` attribute, nothing. The fold state is parsed, stored in the node, round-tripped through MDAST — but visually and interactively it is identical regardless of value. A user opening an Obsidian note with `[!note]-` (collapsed by default) will see the callout fully expanded. There is no way to collapse it in Carbide.

The `details_block` analog shows what a real fold implementation looks like: a `toggle` button, a `toggle_open()` method mutating the `open` attr via a transaction, and a `details_keymap_plugin.ts` for keyboard handling. Callout has none of this.

**Why it matters:** Obsidian uses the collapsed state as a meaningful reading-mode feature. Importing a vault where an author deliberately collapsed callouts will silently expand everything. When the fold feature is eventually implemented it will require a `callout_keymap_plugin` plus changes to `CalloutBlockView` — the schema was right to include the attrs, but shipping without a note that fold is inert is a trap.

**Required action before Phase 3:**
Either (a) add a `// TODO: foldable not yet implemented` comment in `CalloutBlockView.constructor` and document in the plan, or (b) implement the toggle. The schema and remark parser are already correct; only the node view is missing the behavior.

---

### 2. Fallback parse tests do not actually test the fallback

**File:** `tests/unit/adapters/markdown_fallback_parse.test.ts`

**Severity:** Critical

Three tests were written; none of them exercise the fallback path. The plan describes testing "On failure: retries with `fallback_parse_processor`" and "On second failure: returns minimal valid doc". The tests cover:

1. Normal parse of valid markdown (never hits fallback)
2. Normal parse of math (never hits fallback)
3. Normal parse of empty string (never hits fallback)

The entire value of the fallback chain is its behavior under failure. The tests that would actually validate the implementation would be:

- Construct markdown that the primary processor rejects (e.g., malformed math that triggers the math plugin exception) and assert the result is a valid doc
- Mock or trigger a double-failure and assert the emergency empty doc is returned
- Confirm the `console.warn` is called with the right context on failure

As written, these tests would all pass even if the try/catch were deleted from `parse_markdown`. They provide zero regression protection for the feature they claim to test.

---

## Important Improvements

### 3. The "Code Block Language Memory" Phase 1 change was entirely new — confirmed

**File:** `src/lib/features/editor/adapters/slash_command_plugin.ts`

This one is clean. Confirmed by diff that `find_last_code_block_language` did not exist before the Phase 1 commit (commit `d9dd3c41` shows `language: ""`). The feature is new, the implementation is a simple and correct O(n) scan, and it fits cleanly in `make_code_block_insert`. No concerns here beyond noting the test in `code_block_language_memory.test.ts` correctly covers all three cases.

One minor point: `find_last_code_block_language` is defined inside `slash_command_plugin.ts` but is arguably general enough to live in a domain utility. Not worth moving unless other features need it.

### 4. Phase 1 slash_command_plugin.ts changes: only `find_last_code_block_language` was new

The diff from `d9dd3c41` (the prior plugin contribution point commit) to `ede32de7` (Phase 1 commit) shows that `SlashCommand`, `SlashCommandConfig`, `source?: "builtin" | "plugin"`, `plugin_name?: string`, `get_plugin_commands`, the badge render, and `create_slash_command_prose_plugin(config?)` were all already present from commit `d9dd3c41` ("feat(plugin): add slash command contribution point for plugins"). These were not Phase 1 additions.

The plan description ("Slash Command config for plugin_commands") is misleading — it implies the plugin command infrastructure was part of the mdit port. It was not. Only the language-memory addition was genuinely from Phase 1. This is documentation noise, not a code problem, but it creates false attribution in the commit log.

### 5. Callout `callout_title` isolating: true creates an editing trap with no keymap escape

**File:** `schema.ts`, `callout_view_plugin.ts`

`callout_title` has `isolating: true`. This means the cursor cannot leave the title node via arrow keys alone — ProseMirror treats it as a boundary. The `details_block` implementation handles this via `details_keymap_plugin.ts` which provides Tab/Shift-Tab to jump between summary and content.

Callout has no equivalent keymap plugin. After inserting a callout, pressing `Tab` from the title will not move focus to the body. The user can click into the body, which works, but keyboard navigation is broken. This is not a crash but it is a real usability gap that conflicts with the codebase standard (every other isolating node has a corresponding keymap).

### 6. Phase 2 blockquote keyword regression

**File:** `src/lib/features/editor/adapters/slash_command_plugin.ts`

The blockquote slash command previously had `keywords: ["quote", "blockquote", "callout", "cite"]`. Phase 2 removed "callout" from blockquote keywords when adding the dedicated callout commands, but the blockquote description still reads `"Indented quote or callout"`. This inconsistency will cause user confusion: typing "/callout" shows the dedicated callout options (correct) but typing it as a search prefix still shows the "Blockquote" command via description match in some fuzzy implementations.

The description should be updated to just `"Indented quote block"` now that callout has a dedicated entry.

---

## Minor Suggestions

### 7. Focus mode threshold is not configurable

**File:** `block_drag_handle_plugin.ts`

`FOCUS_MODE_KEYSTROKE_THRESHOLD = 4` is a constant in the plugin file. The research document notes this value was copied from mdit. Whether 4 is the right number is debatable, but more importantly there is no settings integration. The existing codebase has pattern for feature flags via `is_feature_enabled()` checked against DOM class (`show-block-drag-handle`). Focus mode bypasses this pattern entirely — it activates even in contexts where the drag handle is globally disabled. Consider gating `on_keydown` inside `is_feature_enabled()`.

### 8. `callout_extension.ts` wrapper is a single-line thin shim

**File:** `src/lib/features/editor/extensions/callout_extension.ts`

```typescript
export function create_callout_extension(): EditorExtension {
  const plugins: Plugin[] = [create_callout_view_prose_plugin()];
  return { plugins };
}
```

This file exists entirely as a wrapper. It currently adds no configuration, no keymap, no additional plugins. When the fold keymap is added (issue 5 above), it will be the right home for it. Until then it is ceremony. Not wrong, just worth noting the pattern is correct even if premature.

### 9. `icon_svg()` in callout_view_plugin.ts inlines SVG path data as strings

**File:** `callout_view_plugin.ts`

The function stores 14 SVG path strings in a plain object. This is functionally fine but will cause the icon to re-render on every `update()` call via `this.icon_el.innerHTML = icon_svg(...)` regardless of whether the type actually changed. The `update()` method checks the callout type but unconditionally reassigns innerHTML. A guard:

```typescript
if (callout_type !== (this.dom.dataset["calloutType"] ?? "")) {
  this.icon_el.innerHTML = icon_svg(get_icon_for_type(callout_type));
}
```

would prevent unnecessary DOM mutations. Low priority but easy.

### 10. Remark callout plugin only transforms top-level nodes

**File:** `remark_plugins/remark_callout.ts`

`transform_children` maps over `tree.children` (top-level MDAST nodes only). A callout nested inside a list item or blockquote will not be detected. This matches Obsidian behavior — callouts in Obsidian are also top-level. But the code comment and test coverage do not mention this limitation. A test covering "blockquote inside list is not converted" would make this explicit behavior rather than accidental behavior.

---

## Architecture Considerations

### Was Phase 2 (Callouts) worth doing before Phase 3 (Inline AI)?

The research document explicitly recommended: "Phase 1 → Phase 3 → Phase 2 → Phase 4 → Phase 5". Phases 1 and 2 were done together instead. Phase 3 is the stated highest-value item.

The callout implementation is correct and the schema design is sound. The remark roundtrip is well-tested. The question is whether 2-3 days on callouts was the right use of time before inline AI. Given that:

- Callouts are purely import/compatibility work (Obsidian vault interop)
- Carbide already has `blockquote` which renders the same raw text
- The inline AI feature is where Carbide is currently weakest vs. alternatives

This is a sequencing judgment call, not a technical problem. But the foldable issue (item 1) means the Obsidian compatibility story is incomplete anyway — a user importing a vault with collapsed callouts gets silently incorrect behavior. Doing Phase 2 before Phase 3 made sense only if the implementation was complete; the unimplemented fold state means the feature is still partially broken for Obsidian users.

### What was actually redundant or could have been skipped?

Nothing in Phase 1 or 2 was pre-existing in the sense of duplicated functionality. However:

- **Phase 1 slash_command plugin changes**: The plan overstated what changed. Only `find_last_code_block_language` was new. The plugin/badge infrastructure predated the port by two commits. No work was wasted, but the plan attribution is wrong.
- **Phase 2 foldable attrs**: Should either have been omitted from the schema (simpler) or implemented (complete). Porting the data model without the behavior is the worst of both worlds — more schema complexity, less correctness.
- **Fallback parse tests**: Could have been skipped and rewritten properly. As currently written they test nothing useful. Three tests that pass against an empty try/catch are worse than no tests because they create false confidence.

---

## Next Steps

Before starting Phase 3:

1. **Fix the fallback parse tests** (item 2) — rewrite to actually trigger fallback and emergency-doc paths. This is a 20-minute fix.
2. **Add a TODO comment or implement fold** (item 1) — at minimum, document in `CalloutBlockView` that fold is schema-only with no UI. This prevents the next developer from wondering why `foldable` exists.
3. **Fix blockquote description** (item 6) — one-line change.
4. **Decide on callout keymap** (item 5) — either add a `callout_keymap_plugin.ts` with Tab navigation before shipping, or document that keyboard-only editing of callouts is unsupported until Phase N.

Items 3, 5, 7, 8, 9, 10 are optional and can be deferred or done inline with Phase 3 work.
