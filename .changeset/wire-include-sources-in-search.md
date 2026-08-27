---
"carbide": patch
---

Make "Include Sources in Search" do something. The setting shipped declared but unread, so linked reference sources (PDFs, HTML) always appeared in search results and were never filtered anywhere else. It now gates the FTS/hybrid search predicate, structured (DSL) omnibar results, similar-note suggestions, and the search graph, and has a toggle in Settings → Toolchain → Reference Manager. Wiki-link autocomplete and block search are separate surfaces and still list sources.

`find_similar_notes` gained a distinct `include_linked_sources` parameter; its existing `exclude_linked` flag — which drops notes you have _already wiki-linked_, not linked sources — is now named `exclude_already_linked` so the two filters cannot be confused again.
