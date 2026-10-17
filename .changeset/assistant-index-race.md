---
"carbide": patch
---

Assistant session retention now actually removes expired sessions. Pruning fired every delete at once and each rewrite of the session index dropped the others' removals, so the same stale sessions came back on every launch.
