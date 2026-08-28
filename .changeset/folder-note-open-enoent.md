---
"carbide": patch
---

Recover a stale folder landing note whose file was deleted externally. Expanding a folder whose landing note the notes cache still listed, but the file was gone on disk, ran `note_open` without the missing-note cleanup flag — so the read failed with `No such file or directory (os error 2)` and surfaced as a generic error toast while the stale entry stayed in the sidebar. The folder-note open now passes `cleanup_if_missing`, so the service prunes the orphaned note from the store and index and returns a `not_found` outcome that the open action already toasts as "Note no longer exists".
