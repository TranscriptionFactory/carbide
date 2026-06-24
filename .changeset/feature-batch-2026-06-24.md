---
"carbide": minor
---

Let live HTML load remote CDN dependencies at the networked trust tier, and harden vault search query routing and ranking.

- Live HTML at the live+net trust tier now permits remote `https:` scripts and stylesheets (Tailwind, Chart.js, Google Fonts, and other CDN deps), matching that tier's existing `unsafe-eval` and `connect-src *` capability. The no-network live tier stays a real "runs code, cannot phone home" guarantee, `http:` is never added to `script-src`/`style-src`, and the iframe sandbox stays exactly `allow-scripts` (no `allow-same-origin`). The Rust and TypeScript CSP builders emit one canonical tier-aware policy, pinned by drift tests on both runtimes.
- Search no longer routes plain-English queries (`in progress`, `with images`, `named entities`) through the structured query solver: structured mode is now gated on a form prefix (`notes`/`files`/`folders`), unambiguous value syntax (`#tag`, `/regex/`, `[[wikilink]]`, quoted strings, property operators), or `linked from`.
- Suggestion ranking is consistent: `index_suggest` now negates BM25 scores unconditionally before its early return, so the exposed score no longer flips sign depending on how many FTS hits came back.
- Search is faster and more correct: the last query embedding is cached to skip a redundant BERT pass, and the client-supplied result limit is forwarded through `index_search` instead of being dropped.
