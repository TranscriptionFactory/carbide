---
"carbide": patch
---

Fix Settings > Tools "Uninstall" leaving the tool on disk after a version bump

`toolchain_uninstall` built its delete path from the *currently pinned* version,
so it could only ever remove `toolchain/<tool>/<current-pin>/<binary>`. Any copy
installed under an earlier pin sat in a sibling directory and was never touched —
while the command still reported success and flipped the UI to "Not installed".
Uninstalling a tool you had installed before an app update therefore appeared to
work and silently did nothing.

Uninstall now removes the whole `toolchain/<tool>/` directory, clearing every
downloaded version. This also fixes the related leak: old version directories
were never garbage-collected on a bump, so each new pin left the previous
binary behind permanently.

Two smaller corrections in the same path: directory removal used non-recursive
`remove_dir` behind `let _ =`, so a failure was silently discarded and reported
as a successful uninstall — errors now propagate. And the cleanup no longer
attempts to remove the shared `toolchain/` parent, which raced against other
tools installing concurrently.
