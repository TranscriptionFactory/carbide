---
"carbide": patch
---

### Bug Fixes

- **Search: rank verbatim multi-word phrases correctly**: A multi-word query was lowered to independent prefix-AND tokens (`name of the game` → `"name"* "of"* "the"* "game"*`), with no phrase semantics. When every term is a common word each term's IDF collapses toward zero, bm25 goes flat across all matches, and the note containing the verbatim phrase ranked arbitrarily — often far down — below notes that merely repeated the words. Multi-term queries now OR an exact-phrase clause with the prefix-AND clause; the phrase carries real IDF and lifts verbatim matches to the top while the prefix-AND arm preserves recall when no exact phrase exists. Single-word queries are unchanged.
- **Search: scope multi-word autocomplete to title/name/path**: `suggest()` built `{title name path} : "a"* "b"*`, but an FTS5 column filter binds only to the phrase that immediately follows it, so only the first term was column-restricted and trailing terms matched unrestricted columns including the body. Multi-word autocomplete (wiki-links, omnibar note-name completion) could therefore surface notes whose body — not title/name/path — contained the later terms. The term group is now parenthesized so the filter applies to every term.
- **Search: preserve backend relevance order in the omnibar re-rank**: The omnibar re-rank overwrote each hit's backend (BM25 / hybrid) score with a title/name/path-only score, so within a match-kind bucket the backend relevance ordering was discarded and dropped from the emitted score. The backend's best-first ordering is now threaded through as a normalized relevance signal and folded into the omnibar score, so results stay ordered by relevance within each bucket while match-kind and recency continue to dominate.
