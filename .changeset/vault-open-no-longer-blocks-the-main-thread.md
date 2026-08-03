---
"carbide": patch
---

fix(startup): opening a vault on a cloud-synced folder no longer freezes the app

Opening a vault stored in OneDrive, iCloud Drive, Dropbox or Google Drive could hang Carbide
indefinitely — one report sat unresponsive for over ten minutes with the window never painting.

The cause was structural rather than a slow disk. Cloud providers leave files as **online-only
placeholders**, and reading one parks the caller in the kernel until the sync daemon downloads the
content. Every Carbide command that touched the filesystem ran on the macOS main thread, so a single
such read stopped the UI, the window, and every pending asset response along with it. Building a
folder listing opened and read _every_ note in the folder, which made a stalled read close to certain.

Two things change. Filesystem work now runs on a background thread, so a slow or unavailable
filesystem makes Carbide slow rather than frozen — the window keeps painting and the app stays
responsive. And the file tree is built from the search index instead of by reading each note, so a
folder opens without touching note contents at all: names appear immediately, and titles, summaries,
colours and icons fill in as indexing catches up. Vaults on ordinary local disks will also notice
folders opening faster.

Startup is now self-diagnosing too. The vault-open path logs each step it reaches, any command taking
longer than 250ms reports itself with a duration, and the log file keeps 5 MB across three files
instead of the previous 40 KB — so if a slow filesystem does cause trouble, the log says where.
