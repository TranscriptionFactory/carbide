---
"carbide": patch
---

Stop writing the vector schema on every search-database open. The init's `INSERT OR IGNORE` took the write lock each time, so while the indexer was mid-batch every open queued behind it until the 5-second busy timeout expired — surfacing as `database is locked` warnings and 5-second `tasks_query` stalls. Opens now probe the schema with a read (WAL readers never wait for the write lock) and skip the write entirely on databases that are already initialized; a database file deleted and recreated at the same path still initializes correctly.
