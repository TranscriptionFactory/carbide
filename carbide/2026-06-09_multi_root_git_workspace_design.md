# Remote Markdown Sync — Minimal Path

**Date:** 2026-06-09

**Question:** How should Carbide make it easier to view, centralize, and keep
in sync markdown documents that are spread across multiple remote GitHub
repositories?

> Companion doc: `remote_markdown_sync_brainstorm.md` enumerates the full option
> space. This document is the converged recommendation after pinning down
> requirements **and** challenging whether a dedicated feature module is even
> warranted. **Conclusion: it mostly is not.**

---

## Requirements (decided)

| Dimension | Decision | Consequence |
|---|---|---|
| **Sync direction** | Bidirectional — edit in Carbide, commit & push back | Requires real git working copies, not API mirrors |
| **Scale** | A handful of repos, single account/org | Full sparse clones are cheap; auth is trivial (one credential set) |
| **Offline** | Important — must read/edit with no network | Local clones mandatory; rules out API-only approaches |

These eliminate the API aggregator and read-only plugin options. The answer is
**local git working copies on disk inside the vault.**

---

## Key realization: almost everything is free

Carbide's value-add features key off **files being present in the vault tree**,
not off any special integration:

- **FTS search** indexes whatever is on disk in the tree.
- **Backlinks / wiki-links** resolve against files in the tree.
- **Watcher** observes the tree.
- **Editing** is just opening files.

And the git layer is **already root-agnostic**: every command in
`src-tauri/src/features/git/service.rs` takes a `vault_path` argument and calls
`Repository::open(path)` (which walks up to the nearest `.git`). Nothing is
hardwired to the vault root — the *frontend* simply always passes the one vault
path.

**Therefore a plain sparse clone into a vault subfolder gives you search,
backlinks, viewing, and editing with zero new code.**

---

## Recommended path (minimal)

1. **Clone into a subfolder.** `git clone --filter=blob:none --sparse` the repo
   into `vault/sources/<repo>/`, with a sparse pattern of `*.md` (or whatever
   globs you want). Add `sources/` to the vault's `.gitignore` so the vault's
   git autocommit leaves the nested repos alone.
   → *Search, backlinks, viewing, and editing all work immediately.*

2. **Pull/push via terminal, for now.** For a handful of repos this is genuinely
   fine. Carbide's built-in terminal covers it.

3. **Add root-aware git only when terminal push actually annoys you.** This is
   the single real capability gap (see below) and it is small — hours, not a
   feature module.

4. **Add a manifest / sidebar panel only if you outgrow hand-cloning.** Don't
   build it speculatively.

---

## The one genuine gap: in-app commit/push to a nested repo

The vault autocommits itself (git autocommit reactor). A clone *inside* the
vault is a nested `.git`; the vault-level git UI only ever targets the vault
root, so it can't commit/push the inner repo. Two consequences:

- gitignore the `sources/` folder so vault autocommit doesn't try to swallow the
  nested repos as gitlinks.
- in-app commit/push to a source repo requires pointing git at the *inner* repo.

Because the Rust git commands already accept an arbitrary path, closing this gap
is a **frontend wiring change, not a module**:

> Resolve `active file → its enclosing git root` and pass *that* path to the
> existing git commands, instead of always passing the vault root.

A resolver function plus a `.gitignore` line. Build it only when the terminal
workflow stops being acceptable.

---

## What was considered and cut

The earlier draft proposed a full `sources` feature module. Audited against the
"avoid speculative future-proofing" rule, most of it does not earn its keep at
this scale / 0 users:

| Proposed piece | Verdict | Why |
|---|---|---|
| `SourceProviderPort` + `GitHubSourceAdapter` | **Cut** | It's `git clone --sparse`. A port abstracts a provider variety that doesn't exist. |
| Manifest (`sources.json`) | **Defer** | Real benefit is reproducible re-setup; at a handful of repos you re-clone by hand. YAGNI until it hurts. |
| `sources_panel.svelte` + status badges | **Cut to cosmetic** | A tree decoration ("this folder is a separate repo + its dirty state"), not infrastructure. |
| Root-aware git ops | **Keep — only this** | The sole genuine capability gap; small frontend change. |

---

## What you trade away with the minimal version

- No visual cue in the file tree that a folder is a separate repo, nor its
  branch/dirty state. (Cosmetic; addable later as a tree decoration.)
- You manage clone/pull/push yourself via terminal until step 3 is built.

For the stated scale (a handful of repos, one account), that is a good trade.

---

## If this ever grows

Revisit a real `sources` feature only when triggered by concrete pain:

- **Many repos / multiple orgs** → a manifest for reproducible setup starts to
  pay off.
- **Frequent re-setup across machines/vaults** → declarative source list.
- **Non-GitHub providers** → *then* a `SourceProviderPort` abstraction is
  justified by actual variety.

Until one of those is real, the minimal path is the correct altitude.
