---
"carbide": patch
---

Vault chat now retrieves at section granularity. The section-level embedding search is fused into the note ranking by Reciprocal Rank Fusion instead of merely decorating notes the keyword search already found, so a note whose one relevant section answers the question surfaces on that section alone, and a note both searches found outranks a bare keyword match. Each retrieved source is also capped to a share of the context budget, so one long note or one PDF body no longer fills the retrieval meter before the other sources are read; `@`-mentioned notes are exempt from the cap. Linked reference sources now follow the "Include Sources in Search" setting in chat, as they already do in search, similarity and graph edges.
