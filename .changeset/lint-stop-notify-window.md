---
"carbide": patch
---

Close the lint notify window during stop. The backend removed the lint session at stop start, but the frontend only flipped `is_running` after `port.stop` resolved, so a file-open notification landing in that window failed with "No active lint session". `lint_service.stop()` now tears down local state (status flip + unsubscribe) before awaiting the backend stop, mirroring the markdown LSP ordering, and the backend file-notification commands return a typed silent no-session outcome (debug log) instead of a string error.
