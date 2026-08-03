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
folder opens without touching note contents at all. Vaults on ordinary local disks will also notice
folders opening faster.

There is a visible trade-off in that second change. A note's title, summary, colour and icon now come
from the index, so a note the index has not caught up with yet lists under its filename with no
summary — most often on the first listing after opening a vault, since that runs before indexing
starts. Reopening the folder once indexing has progressed shows the full metadata. Folders opened in
browse mode are never indexed, so they always list by filename.

Startup is now self-diagnosing too. The vault-open path logs each step it reaches, any command taking
longer than 250ms reports itself with a duration, and the log file keeps 5 MB across three files
instead of the previous 40 KB — so if a slow filesystem does cause trouble, the log says where.
