# Code Review: Heading Suggest Feature — Code Reuse Audit

Last Updated: 2026-04-13

Scope: CODE REUSE issues only. Each finding includes a search-verified verdict.

---

## Executive Summary

Five reuse issues were identified. Two are actionable duplications that should be
fixed. Two are design mismatches worth a judgment call. One is a false alarm on
closer inspection.

---

## Critical Issues

### 1. `make_search_port_with_cache` duplicates `make_search_port` verbatim

**File:** `tests/unit/services/search_service.test.ts`, lines 862–912

**Finding:** `make_search_port_with_cache` is a copy-paste of `make_search_port`
(lines 676–722) with one difference: `get_file_cache` returns a populated cache
object instead of an empty `{}`. Every other mock entry — all 18 of them — is
identical.

**Verified by:** Side-by-side read of both factory functions. They share:

- `suggest_wiki_links`, `suggest_planned_links`, `search_notes`
- `get_note_links_snapshot`, `extract_local_note_links`, `rewrite_note_links`
- `resolve_note_link`, `resolve_wiki_link`, `semantic_search`, `hybrid_search`
- `get_embedding_status`, `find_similar_notes`, `semantic_search_batch`
- `rebuild_embeddings`, `get_note_stats`
- `load_smart_link_rules`, `save_smart_link_rules`
- `compute_smart_link_suggestions`, `compute_smart_link_vault_edges`

The single difference is `get_file_cache`:

- `make_search_port`: `vi.fn().mockResolvedValue({})`
- `make_search_port_with_cache(headings)`: returns full `FileCache` shape with
  the `headings` argument injected

**Recommended fix:** Extend `make_search_port` to accept an optional overrides
argument (mirrors the pattern already used for `hybrid_search_error`):

```typescript
function make_search_port(
  overrides: {
    search_notes_results?: NoteSearchHit[];
    hybrid_search_results?: HybridSearchHit[];
    hybrid_search_error?: Error;
    file_cache_headings?: Array<{ level: number; text: string; line: number }>;
  } = {},
) {
  return {
    // ...existing mocks...
    get_file_cache:
      overrides.file_cache_headings !== undefined
        ? vi.fn().mockResolvedValue({
            frontmatter: {},
            tags: [],
            headings: overrides.file_cache_headings,
            links: [],
            embeds: [],
            stats: {},
            ctime_ms: 0,
            mtime_ms: 0,
            size_bytes: 0,
          })
        : vi.fn().mockResolvedValue({}),
  };
}
```

Then the `get_note_headings` describe block uses `make_search_port({ file_cache_headings: headings })` and the error test overrides `get_file_cache` directly — exactly as it already does.

**Severity:** Important. This is ~45 lines of straight duplication in a test file
that already has a clearly established mock factory pattern. Future additions to
`SearchPort` will need to be updated in two places.

---

## Important Improvements

### 2. Heading filter uses `toLowerCase().includes()` — `fuzzy_score` already exists

**File:** `src/lib/features/editor/application/editor_service.ts`, around line 607

```typescript
const query_lower = heading_query.toLowerCase();
const filtered = headings.filter((h) =>
  h.text.toLowerCase().includes(query_lower),
);
```

**Verified by:** `src/lib/shared/utils/fuzzy_score.ts` exports `fuzzy_score`,
`fuzzy_score_multi`, and `fuzzy_score_fields`. The slash command plugin (same
editor feature area) imports `fuzzy_score_fields` from that module and uses it
for filtering commands. The wiki suggest plugin itself does NOT use it for note
filtering — that filtering is done server-side — but the heading filter is the
first client-side, in-memory filter in the wiki suggest flow.

**Implication:** `includes()` is a substring match. It will miss "Meth" matching
"Methods" if the user typed from a non-prefix position, but more importantly it
won't rank results by match quality. The slash command plugin scores and sorts by
`fuzzy_score_fields`. The heading suggest plugin just truncates with `filter()`.
This is an inconsistency in developer experience within the same editor plugin
family.

**Recommended fix:**

```typescript
import { fuzzy_score } from "$lib/shared/utils/fuzzy_score";

const filtered = heading_query
  ? headings
      .map((h) => ({ h, score: fuzzy_score(heading_query, h.text) }))
      .filter(({ score }) => score !== null)
      .sort((a, b) => (b.score?.score ?? 0) - (a.score?.score ?? 0))
      .map(({ h }) => h)
  : headings;
```

**Severity:** Important. Not a correctness bug today, but it's an inconsistency
with the established pattern in the codebase (`fuzzy_score_fields` in
`slash_command_plugin.ts`) and will produce a noticeably worse UX for longer
heading names.

---

### 3. `extract_wiki_query` re-called inside `accept()` to recover `note_name`

**File:** `src/lib/features/editor/adapters/wiki_suggest_plugin.ts`, lines 231–237

```typescript
if (item.kind === "heading") {
    const parsed = extract_wiki_query(
        view.state.doc.textBetween(state.from, view.state.selection.from),
    );
    const note_prefix =
        parsed && parsed.mode === "heading" && parsed.note_name
            ? parsed.note_name
            : "";
```

**Finding:** `note_name` is parsed at query time (inside the `handleTextInput`
path and stored in `ExtractedQuery`) but `WikiSuggestState` does not carry it.
So `accept()` must re-parse the document text to recover it.

**Verified by:** `WikiSuggestState` definition (lines 34–41 in the diff) has no
`note_name` field. The re-call is necessary as written.

**Recommended fix:** Add `note_name: string | null` to `WikiSuggestState` and
populate it when setting state in the `handleTextInput` path. `accept()` can then
read `state.note_name` directly — same pattern as `state.from`, `state.query`,
etc.

```typescript
type WikiSuggestState = {
  active: boolean;
  query: string;
  from: number;
  items: SuggestionItem[];
  selected_index: number;
  mode: "note" | "heading";
  note_name: string | null; // add this
};
```

The re-parse is low cost (it's just a string scan), but storing derived parse
state in the plugin state is what the plugin already does for every other
extracted field (`query`, `from`, `mode`). This is an inconsistency in the
state management pattern established by the plugin itself.

**Severity:** Important for consistency and future-proofing. It also eliminates a
subtle correctness risk: the re-parsed text range is
`state.from → view.state.selection.from`, which assumes the cursor has not moved
between query time and accept time. It will always be true today (accept is
synchronous), but it's an invisible invariant.

---

## Minor Suggestions

### 4. `dismissed_query` key construction duplicated twice — no helper, but low impact

**File:** `src/lib/features/editor/adapters/wiki_suggest_plugin.ts`

The expression `current.mode + ":" + current.query` (dismiss path, line 209) and
`result.mode + ":" + result.query` (check path, line 351) implement the same
key-construction logic.

**Verified by:** Searched entire codebase for dismiss key patterns — this
construction is unique to this plugin and appears nowhere else. There is no shared
"dismiss key" utility to reuse.

**Assessment:** Two call sites, no external usage. Extracting a one-liner
`make_dismiss_key(mode, query)` is defensible for expressiveness but not urgent.
Template literal form (`\`${mode}:${query}\``) is at minimum slightly cleaner
than the `+` concatenation currently used.

**Severity:** Minor.

---

### 5. `set_heading_suggestions` vs. `set_wiki_suggestions` — not a missing generic

**File:** `src/lib/features/editor/adapters/wiki_suggest_plugin.ts`, lines 539–552

**Finding:** `set_heading_suggestions` maps an external array of `{ text, level }`
to `HeadingSuggestionItem[]` (adding `kind: "heading"`) before dispatching the
same `setMeta` call used by `set_wiki_suggestions`. The question was whether a
generic `set_suggestions` pattern should unify both.

**Verified by:** `set_wiki_suggestions` dispatches `{ items }` directly without
mapping — the external shape already matches `NoteSuggestionItem`. The heading
variant must map because the caller (`editor_service`) works with the
`CachedHeading` type from the search port, which lacks `kind`. The asymmetry is
load-bearing: both functions share the same `setMeta` call and plugin key. The
only duplicate logic is `view.dispatch(view.state.tr.setMeta(wiki_suggest_plugin_key, { items }))`.

**Assessment:** A generic helper `dispatch_suggestion_items(view, items)` could
eliminate the one-line dispatch duplication, but given both functions are
2–8 lines total and the mapping in `set_heading_suggestions` is essential, this
would be cosmetic only. Not worth the abstraction cost.

**Severity:** Not an issue.

---

## Architecture Considerations

- The test mock factory pattern established by `make_search_port` with an
  `overrides` object is solid. Issue 1 breaks that pattern by introducing a
  parallel factory. Consolidating keeps the search port mock as a single source
  of truth, which matters as the port interface grows.

- The `fuzzy_score` utility was clearly built for exactly this kind of in-editor
  filtering (it has a fast path for short queries, handles camelCase boundaries,
  etc.). Bypassing it for substring matching in the heading filter is the kind of
  inconsistency that accumulates into divergent UX quality across plugin types.

---

## Next Steps

Priority order for the actionable issues:

1. **Merge `make_search_port_with_cache` into `make_search_port`** — pure
   mechanical refactor, zero risk to logic.
2. **Add `note_name` to `WikiSuggestState`** — eliminates the re-parse in
   `accept()` and makes state self-contained.
3. **Switch heading filter to `fuzzy_score`** — align with slash command plugin
   pattern and improve match quality.
