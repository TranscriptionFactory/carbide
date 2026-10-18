---
"carbide": patch
---

Quitting right after a large batch of notes was removed no longer leaves the search worker running past shutdown. Reclaiming the search index's dead entries ran for minutes with no way to stop it; it now runs in parallel, about five times faster, and stops promptly when the app quits.
