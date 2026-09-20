---
"carbide": patch
---

Opening a vault whose notes are already embedded no longer loads the embedding model. The startup pass checks what is actually left to embed — notes and sections — before the encoder is touched, so an up-to-date vault finishes indexing in the time the database queries take instead of paying a cold model load on every launch. Reopening a connection is cheaper for the same reason: the schema is now stamped and migrated once per database rather than replayed on every open, which matters because several features open their own connection per call. On macOS the launch's rebuild, first index sync and first embedding pass run one scheduling class above background so they are not stretched out for work the user is waiting on, and drop back once that pass finishes. Startup is also easier to measure now: the log carries a duration for the graph load and for a completed index sync.
