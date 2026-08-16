---
"carbide": patch
---

Refresh the markdown toolchain pins and verify every download

The four language tools installed from Settings > Tools were pinned to versions
that had drifted badly behind upstream, and half of them were being installed
without any integrity check.

Pins now track the current upstream releases:

- rumdl `0.1.59` → `0.2.55` (93 releases behind)
- IWE `0.0.67` → `0.19.1` (37 releases behind)
- Markdown Oxide `0.25.10` → `0.25.12` (2 releases behind)
- Marksman stays at `2026-02-08`, already current

All sixteen tool/platform SHA-256 hashes are now real. Previously the IWE and
Markdown Oxide entries carried the literal string `"TODO"`, which
`downloader::download_tool` treats as "skip verification" — so eight of the
sixteen downloads were being written to disk, marked executable, ad-hoc
codesigned on macOS, and spawned as a long-lived LSP child process without their
contents ever being checked. Each hash was computed from the released artifact
and independently reconfirmed before being recorded.

Also fixes IWE's Windows asset name, which asked for
`iwe-v{version}-x86_64-pc-windows-msvc.tar.gz`. Upstream has only ever published
that build as a `.zip`, so installing IWE on Windows had been 404-ing since the
entry was first written — this was not upstream drift.

A new registry test asserts that every SHA-256 is 64 hex characters, so a
placeholder can no longer silently disable integrity verification.
