---
"carbide": patch
---

fix(search): semantic search stops silently dropping notes

Semantic search could omit a note that clearly matched, with no error and no
sign anything was wrong — the same query could return it on one run and not the
next. Roughly one note in sixteen was affected at any given time, and which ones
changed every time the index was rebuilt.

The cause is upstream, in the `hnsw_rs` graph library: when a note is placed on
an upper layer of the search graph, the library files its reverse link on the
wrong layer, so the note ends up with no inbound edge on the bottom layer that
every query finishes its traversal in. The note is in the index, and simply
cannot be reached by a search. There is no newer release to upgrade to.

Vaults up to 4096 notes now answer semantic queries by scanning every note
directly, using the same distance metric the graph used, so results are exact
rather than approximate — measured at 1.39 ms per query at the 4096-note limit,
which is well inside what the search feels like at any size. Loading a saved
index also rebuilds the vectors it needs instead of coming back half
initialised, which is what made a reloaded index disagree with a freshly built
one.

**Vaults larger than 4096 notes still traverse the graph and remain exposed to
this bug.** Fixing it there means patching the library itself; a one-line
upstream correction was measured and cuts the miss rate from ~6.5% to ~0.2% but
does not eliminate it, so it is deliberately not shipped here.

Also fixed: setting up the MCP connection read and wrote the auth token through
process-wide environment variables, which two operations running at once could
interleave — one could read a half-written value, and unrelated work reading the
same variables could observe them changing underneath it. The token path and the
home directory are now passed in directly.
