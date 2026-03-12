# Git Remote Operations — Implementation Log

Ported from `scratch` project's CLI-based git module (carbide/scratch/scratch.md item 4).

## What was added

### Rust backend (`src-tauri/src/features/git/service.rs`)

**New struct:**

- `GitRemoteResult { success, message, error }` — response type for all remote ops

**New Tauri commands (CLI-based, not git2):**

- `git_push` — push to tracked upstream
- `git_fetch` — fetch with `--quiet`
- `git_pull` — pull with `pull.rebase=false`
- `git_add_remote` — add origin with URL validation (https/http/git@)
- `git_push_with_upstream` — `push -u origin <branch>` for first push

**Why CLI instead of git2:**
git2's remote auth requires complex callback setup for SSH keys and credential helpers. The CLI naturally uses the user's configured auth. Local ops (status, commit, diff, log) remain on git2.

**Network resilience:**
All remote commands set `http.lowSpeedLimit=1000`, `http.lowSpeedTime=10`, and `GIT_SSH_COMMAND="ssh -o ConnectTimeout=10"`.

**Error parsing:**

- `parse_remote_error` — auth failures, DNS resolution
- `parse_push_error` — repo not found
- `parse_pull_error` — uncommitted changes, merge conflicts, diverged histories, unrelated histories

**Cross-platform:** Windows gets `CREATE_NO_WINDOW` flag on all git CLI calls.

**Extended `GitStatus`:**
Added `has_remote: bool`, `has_upstream: bool`, `remote_url: Option<String>` — populated via git2's `find_remote("origin")`.

### TypeScript frontend (full port/adapter stack)

| Layer   | File                               | Changes                                                                                       |
| ------- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| Types   | `types/git.ts`                     | Added `GitRemoteResult`, extended `GitStatus` with `has_remote`, `has_upstream`, `remote_url` |
| Port    | `ports.ts`                         | 5 new methods: `push`, `fetch`, `pull`, `add_remote`, `push_with_upstream`                    |
| Adapter | `adapters/git_tauri_adapter.ts`    | IPC implementations for all 5 commands                                                        |
| Service | `application/git_service.ts`       | `push()`, `pull()`, `fetch_remote()`, `add_remote(url)`, `sync()`, history paging/cache       |
| Store   | `state/git_store.svelte.ts`        | Remote metadata, history pagination state, and note-scoped history cache                      |
| UI      | `ui/git_status_widget.svelte`      | Push / fetch / pull controls, ahead-behind badges, add-remote CTA                             |
| UI      | `ui/add_remote_dialog.svelte`      | Remote URL dialog wired through `UIStore` + action registry                                   |
| UI      | `ui/version_history_dialog.svelte` | Initial loading state, incremental loading state, and `Load more`                             |
| Barrel  | `index.ts`                         | Exports `GitRemoteResult` and add-remote dialog                                               |

**Service behavior:**

- `push()` — auto-detects upstream; uses `push_with_upstream` on first push
- `pull()` — sets sync_status to "pulling", refreshes status after
- `fetch_remote()` — lightweight, no sync_status change
- `add_remote(url)` — validates and adds origin
- `sync()` — convenience: commit dirty changes + pull + push
- history open path now loads 20 commits first, caches by note path, and paginates forward with `Load more`
- history cache invalidates after local commits, restores, and pulls

### Tests updated

- `tests/adapters/test_git_adapter.ts` — added 5 new port method stubs
- `tests/unit/services/git_service.test.ts` — added remote-op and history cache / pagination coverage
- `tests/unit/stores/git_store.test.ts` — added history cache / pagination metadata coverage
- `tests/unit/actions/register_git_actions.test.ts` — added add-remote dialog and fetch action coverage
- `tests/unit/actions/register_omnibar_actions.test.ts` — added git command-palette mapping coverage
- `tests/unit/domain/default_hotkeys.test.ts` — asserts remote-op default hotkeys exist

## What's left (not in scope for this pass)

- **Periodic fetch** — no background polling for upstream changes
- **Full remote management UI** — only add-origin is exposed; editing/removing remotes still needs a settings/panel story
- **Auto-commit settings** — interval / policy configuration still pending

## Commit

`b91947a` on `feat/carbide_git_features`
