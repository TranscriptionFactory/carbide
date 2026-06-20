# Multi-Device Vault Editing — Design Recommendation

**Date:** 2026-06-19

**Question:** How should a single Carbide vault be edited from multiple machines
without file-organization drift, given git-as-dropbox is causing pain?

> Distinct from `remote_markdown_sync_brainstorm.md`, which covers the *inverse*
> problem (aggregating markdown from *many* external repos *into* one vault). This
> doc is about **one vault, edited from many machines**.

---

## Context

One notes **vault** (plain markdown directory), canonical on a local computer,
tracked in git. Edited from multiple machines using a shared GitHub repo as a
"dropbox" (manual push/pull). The pain: **file organization suffers** —
specifically **move/rename churn** and **merge conflicts / divergence** between
copies. Always-on Linux machines are available to act as servers.

Clarified constraints:
- **Pain = rename/move churn + merge/divergence.** (Not collaborator collisions, not "forgot to sync.")
- **Editing is sequential** — one machine at a time. No concurrent same-file edits.
- **Remotes are always-online servers.**
- **Open to editing via terminal/web** on the server, not only Carbide.

### The reframe that drives everything

The two pains are **both symptoms of one root cause**: keeping *multiple
diverging copies* and reconciling them through git's 3-way merge. Git represents
a move as delete+add, so reorganizing on one machine while editing on another
produces churn and conflicts. **Collapse to a single canonical copy and both
pains disappear by construction** — there is nothing to merge, and a rename is
just a rename. The "sequential + always-online" regime is exactly where the
single-copy model is practical *without* any real-time/CRDT machinery.

The "daemon/server" instinct is right — but there's no need to *build* one;
off-the-shelf parts get ~all the way with near-zero Carbide code.

### Why Carbide makes this clean (codebase findings)

- **External-change live-reload already works.** The `watcher` feature
  (`src-tauri/src/features/watcher/service.rs`) uses the `notify` crate to detect
  files changing underneath Carbide and re-index/refresh. **Any external sync tool
  that keeps the local vault dir current composes with Carbide automatically** —
  no need to build sync into the app.
- **Search index is machine-local** (`~/.carbide/caches/vaults/{id}.db`,
  `search/db.rs:845`). It will *not* be caught in a directory sync.
- **Manual reindex commands exist**: `index_build`, `index_rebuild`,
  `index_sync_paths` (`search/service.rs:2008-2077`) — an escape hatch when the
  watcher can't fire.
- **Watcher is OS-native (FSEvents/inotify), no polling fallback**
  (`watcher/service.rs:203`). ⇒ **It will not fire over SSHFS/NFS network
  mounts.** This is why the local Carbide machine should hold a *real local
  replica*, not a mount.
- **Vault-local `.carbide/` is portable config** (bases views, references,
  annotations, smart-link rules, plugin settings) — it *should* travel with the
  vault. It's only excluded from *indexing*, not from sync.

---

## Recommended Architecture

**One canonical vault on an always-on Linux server. Edit it in place from
always-online boxes; keep a live local replica only where Carbide runs. Only the
server commits to git.**

```
                ┌─────────────────────────────────────────┐
                │  Linux server (always-on)  = CANONICAL   │
                │  • the one true vault directory          │
                │  • code-server (VS Code in browser)      │
                │  • git auto-commit cron → push to GitHub │
                │    (GitHub = backup/history, NOT sync)   │
                │  • Syncthing node                         │
                └──────────────┬───────────────┬───────────┘
                  Syncthing     │               │  edit in place
                  (live mirror) │               │  (SSH / web / nvim)
                ┌───────────────┴───┐      ┌─────┴──────────────────┐
                │ Local computer    │      │ Other always-online    │
                │ • Carbide         │      │ Linux remotes          │
                │ • Syncthing replica│     │ • no replica needed    │
                │   (watcher works) │      │ • edit server directly │
                └───────────────────┘      └────────────────────────┘
```

### Editing surfaces

1. **Always-online remotes (and the server itself):** edit the canonical vault
   *in place* — `code-server` (VS Code in a browser tab), VS Code Remote-SSH, or
   terminal nvim. Zero sync, zero divergence. **This replaces the GitHub-dropbox
   workflow for remote editing.**

2. **Local computer (where Carbide runs):** run a **Syncthing replica** of the
   vault. Carbide edits a genuine local directory, so its FSEvents watcher and
   live-reload work perfectly; it's snappy and offline-tolerant. Syncthing keeps
   the replica converged with the server. Sequential editing ⇒ effectively
   conflict-free (Syncthing only writes `.sync-conflict-*` files on true
   simultaneous same-file edits, which are ruled out).

   *(Alternative for this machine: SSHFS-mount the server vault instead of a
   replica. Simpler/truly-single-copy, but the watcher stays silent over the
   mount, so a manual `index_build` is needed on return. Recommended only if you
   dislike running Syncthing. Replica is the better default.)*

### Git's new, narrower role

- **Only the server commits.** A `systemd` timer (or cron) on the server runs a
  debounced `git add -A && git commit -m "auto: $(date)"`, then periodic
  `git push` to GitHub as **off-site backup + linear history**.
- Because only one node commits one canonical tree, **git never merges** →
  rename churn and divergence are gone. GitHub is demoted from "live dropbox" to
  "backup."
- *If others still push to that GitHub repo:* have the server `git pull --rebase`
  before pushing. That reintroduces a single controlled merge point **on the
  server only** — still no per-device divergence. (Collaborator collisions aren't
  a current pain, so this is a footnote.)

### Sync hygiene (what travels, what doesn't)

- **Travels with the vault:** all markdown, assets, and most of `.carbide/`
  (bases views, references, annotations, smart-link rules, plugin settings) so
  config follows you.
- **Stays machine-local automatically:** the search DB (`~/.carbide/caches/...`)
  and vault registry (`~/.carbide/vaults.json`) live outside the vault dir.
- **Exclude from sync** via Syncthing `.stignore` / `.gitignore` if churn
  appears: `.carbide/plugins/` (re-downloadable binaries) and optionally
  `.carbide/reading_positions.json`. Start permissive; add ignores only if noise.
- **Large binary assets** (images, `.excalidraw`): fine for Syncthing/SSHFS. If
  they bloat git history, consider `git-lfs` or `.gitignore`-ing big asset dirs
  (content still syncs via Syncthing; git just stops versioning blobs).

---

## Optional Carbide enhancement (only for the SSHFS-mount variant)

A one-click **"Resync vault"** action wired to the existing `index_build` /
`index_rebuild` Tauri commands (`search/service.rs:2008-2077`) plus a tree
refresh, for when the watcher can't see mount-side changes. **Not needed** with
the recommended Syncthing-replica setup, where the watcher works natively. Per
`docs/architecture.md`, this is a small frontend action in the vault feature; no
new backend command required.

---

## Alternatives considered (and why not)

- **Keep GitHub-as-dropbox + per-machine auto-commit/pull daemon (Obsidian-Git
  style).** Treats the symptom: still multiple diverging copies ⇒ 3-way merges ⇒
  the exact pains (rename churn, conflicts) persist. Rejected.
- **Build real-time/CRDT sync into Carbide (Yjs + relay server).** Large build;
  only justified by *concurrent same-file* editing, which is ruled out. Premature
  for a 0-user, sequential-editing workflow.
- **Federated multi-repo index** (`remote_markdown_sync_brainstorm.md`). Solves a
  *different* problem — aggregating external repos *into* a vault. Not applicable.

---

## Verification (end-to-end test)

1. **Stand up canonical + history.** On the server: place the vault, init/confirm
   git, add the `systemd` timer (or cron) for debounced auto-commit + periodic
   push. Confirm a `touch`+wait produces an auto-commit and a GitHub push.
2. **In-place remote edit.** From another always-online box, edit a note via
   `code-server`/SSH/nvim. Confirm the change is auto-committed on the server.
3. **Local Carbide via Syncthing.** Install Syncthing on server + local computer;
   share the vault folder. Open the vault in Carbide locally.
   - Edit in Carbide → confirm it reaches the server and gets auto-committed.
   - Edit on the server → confirm Carbide **live-reloads** it (watcher fires
     because the replica is a real local dir). Key assertion distinguishing the
     replica from the dead-watcher mount path.
4. **Rename test (the core pain).** Rename/move a note on one machine. Confirm it
   propagates as a clean rename everywhere with **no conflict files and no git
   merge** — only a linear auto-commit on the server.
5. **`.carbide/` portability.** Create a base view / annotation on one machine;
   confirm it appears on the other after sync.
6. *(Mount variant only)* confirm "Resync vault" refreshes Carbide after a
   server-side edit, since the watcher won't fire.

---

## Open items

- Infra steps (Syncthing install, systemd timer, server setup) run on your
  machines — exact unit files / commands and a `.stignore`/`.gitignore` template
  can be provided, plus scaffolding the optional "Resync vault" action if the
  mount route is taken.
- Decision for the **local machine**: Syncthing replica (recommended — full
  Carbide fidelity) vs SSHFS mount (simpler, manual refresh).
