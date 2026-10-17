---
"carbide": patch
---

Two writes to the same file at the same moment can no longer fail with "No such file or directory". Concurrent writers used to share one staging file and rename it out from under each other; writes to a path now take turns.
