---
"carbide": patch
---

Fixed semantic search producing no embeddings on Apple Silicon. Since June the encoder has run in half precision on the GPU, where the attention mask it builds internally evaluates to "not a number" — so every vector it produced was invalid. The vectors were stored anyway and quietly ruined every semantic result; the recent ingest guard started refusing them instead, which is why the embedding counter sat at zero. The encoder now runs in full precision on every device, checks itself against a known input the moment it loads so a broken encoder refuses to start rather than filling a vault with unusable vectors, and reports a failed batch once with the detail needed to diagnose it rather than once per section. Embeddings on affected machines rebuild in the background on first launch.
