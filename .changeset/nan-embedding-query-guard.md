---
"carbide": patch
---

Degrade search honestly when the embedding encoder produces an unusable query vector. On some inputs the encoder intermittently emits an all-NaN row, which normalization zeroes — and a zero query is cosine-equidistant from every note, so semantic, block, and hybrid search returned arbitrary neighbours with confident scores. Those queries now skip the vector leg entirely (hybrid search falls back to text ranking) and log one warning per session naming the query. The ingest-side "pooled rows unusable" warning now also names the caller and an escaped excerpt of the input that poisoned the encoder — the one fact the old warning omitted — so the next occurrence on Metal is diagnosable from carbide.log.
