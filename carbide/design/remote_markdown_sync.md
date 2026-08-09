# Remote Markdown Sync — Options and Minimal Path

**Dates:** 2026-06-09 (option space), 2026-06-09 (converged recommendation)
**Question:** How should Carbide view, centralize, and keep in sync markdown
documents spread across multiple remote GitHub repositories?

> Consolidated 2026-08-09 from `remote_markdown_sync_brainstorm.md` (option
> space) and `2026-06-09_multi_root_git_workspace_design.md` (converged path).
> Originals in `carbide/archive/design/`.
>
> Distinct from `multi_device_vault_sync.md`, which covers the **inverse**
> problem: one vault edited from many machines.

**Conclusion: a dedicated feature module is mostly not warranted.**

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
   globs you want). Add `/sources/` to the vault repo's **`.git/info/exclude`**
   (NOT `.gitignore` — see the gap section) so vault git leaves the nested repos
   alone while Carbide keeps indexing them.
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

- Exclude the `sources/` folder from vault git via **`.git/info/exclude`**, not
  `.gitignore`. Both stop vault git from swallowing the nested repos as gitlinks,
  but the search index's ignore matcher (`shared/vault_ignore.rs`) reads
  `.gitignore` and `.vaultignore` — so `.gitignore` would also de-index every
  synced doc (no FTS, no backlinks). `.git/info/exclude` is local-only and the
  matcher does not read it, so it hides the repos from vault git while Carbide
  keeps indexing them.
- in-app commit/push to a source repo requires pointing git at the *inner* repo.
- **Autocommit correctness, not just push.** The autocommit reactor stages
  *specific edited paths* via libgit2 `index.add_path` (`git/service.rs`), which
  bypasses ignore rules entirely (`.gitignore` *and* `info/exclude`). So editing
  a source-repo note in Carbide force-stages it into the *vault* repo (wrong
  repo), regardless of the exclude above. Until the resolver below lands, treat
  synced docs as read-mostly in-app, or edit them via the inner repo. Root-aware
  git is what makes in-app editing of nested repos correct — not merely a push
  convenience.

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

---

# Appendix — Full option space (2026-06-09 brainstorm)

Retained because it records *why* the options above were eliminated.

## Current capabilities the options build on

| Capability | Location |
|---|---|
| Vault system (local markdown files) | `src/lib/features/vault/` |
| Git integration (init, commit, push/pull, remotes) | `src/lib/features/git/` |
| Plugin system (iframe + RPC API) | `src/lib/features/plugin/` |
| Linked sources (scan folders → index content) | `src/lib/features/reference/` |
| FTS search (SQLite) | `src/lib/features/search/` |
| External MCP / sidecar | `src-tauri/src/features/external_mcp/` |
| Plugin network fetch | `plugin_rpc_handler.ts` (`network.*`) |
| Plugin vault CRUD | `plugin_rpc_handler.ts` (`vault.*`) |

## Options, lightest → deepest

**1. Plugin: GitHub read-only browser.** `network.*` against the GitHub API,
browsable tree in a sidebar. Zero core changes, works today. **Rejected:** no FTS
indexing, no offline, rate limits, read-only unless copied.

**2. Plugin + local clone + FTS.** `sidecar.*` spawns a binary managing local
clones; files enter the vault via `vault.create`. Reuses FTS, offline-capable.
**Rejected:** duplicates disk, one-way, messy when vault git and imported content
track the same repo.

**3. Vault-as-git-sources.** New `remote` feature module: registry of repos,
shallow clone into a vault subfolder, periodic pull, push back. Deep integration,
FTS free, bidirectional. **Superseded** — the minimal path above achieves this
without the module.

**4. Linked source extension.** Extend `Reference/LinkedSourcePort` to URL-based
sources, reusing `scan_folder` → `index_content`. Less new code. **Rejected:**
linked sources are modeled for cited PDFs/research; repurposing confuses the
mental model.

**5. Plugin + GitHub MCP server.** Wrap an MCP GitHub server via `sidecar.*`.
Thin plugin code. **Rejected:** no local storage/offline, chatty per-file
protocol, no FTS integration.

**6. Cross-vault federated index.** Registry of remote collections, lazy fetch
into a unified FTS index, virtual "Remote" tree section, polling via ETag or
webhook relay. Polished UX. **Rejected:** most work, webhook relay is its own
infrastructure, overkill at 0 users.

## Design dimensions

| Dimension | Options |
|---|---|
| Sync direction | Read-only vs. bidirectional |
| Scope | Single repo, org-wide, arbitrary URL |
| Update mechanism | Manual, periodic polling, webhooks |
| Storage | Inline copy, linked reference, view-only |
| Search | FTS across everything, repo-scoped only |
| UX | Browse tree, unified search, individual note view |

## Why the plugin-only options all fail

A plugin-only approach (1, 2, 5) inevitably hits the same three walls: no FTS
integration, no offline capability, no edit-and-push-back flow. The federated
index (6) is ambitious but premature without validation. That leaves local git
working copies — which, per the main body, need almost no code at all.
