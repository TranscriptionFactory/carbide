---
"carbide": patch
---

Semantic indexing no longer stalls partway through, and the progress indicator no longer restarts or hangs.

Embedding and text indexing shared a single cancellation signal, so any work that touched the text index — opening a vault, rebuilding, indexing a batch of paths — aborted an embedding pass that happened to be running. The follow-up request that would have restarted it was then dropped, because the system still believed a pass was in flight. The practical result was sections of your vault left unembedded, and staying that way until you reopened the vault.

Embedding now has its own cancellation signal, and a pass interrupted or requested while another is running is re-queued exactly once rather than discarded. Cancelled passes no longer report themselves as completed.

Two visible fixes come with it. A vault where every note is already embedded but sections are still pending now finishes and clears the "Embedding sections" indicator instead of showing it indefinitely. And saving while a vault-wide sync is running no longer restarts that sync from the beginning — with autosave on, a long sync could be reset every couple of seconds and visibly count back up from zero without ever finishing.

Also fixed: when part of a note failed to encode, the note was recorded as embedded anyway using only the parts that succeeded, permanently. Those notes are now left for the next pass to retry.
