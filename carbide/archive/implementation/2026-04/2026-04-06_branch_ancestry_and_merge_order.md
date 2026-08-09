# Branch Ancestry & Merge Order

**Date:** 2026-04-06
**Companion to:** `carbide/2026-04-05_conversation_work_units.md`
**Base commit:** `d6a47599 chore: release v1.13.0` (current `main`)

---

## Branch Topology

There are **two independent lineages** plus one stale planning branch:

### Lineage A — Main Stack (linear chain)

Each branch is stacked on top of the previous. Every later branch contains all commits from earlier branches.

```
main (d6a4759)
 └─ feat/mcp-stdio .............. 11 commits  (units 1.1–1.5)
     └─ feat/metadata-headings-cmd  2 commits  (unit 2.1)
         └─ feat/metadata-foundations  6 commits  (units 3.1–3.3)
             └─ feat/metadata-enrichment  5 commits  (units 4.1–4.2)
                 └─ feat/smart-linking .... 10 commits  (units 5.1–6.2)
                     └─ feat/http-cli ..... 16 commits  (units 7.1–8.2)
                         └─ feat/metadata-file-cache  2 commits  (unit 9.1)
                             └─ feat/plugin-hardening  6 commits  (units 10.1–10.3)
                                 └─ feat/block-embeddings  4 commits  (units 11.1–11.2)
                                     └─ feat/extended-tools  10 commits  (units 12.1–12.5)
```

**Total:** 72 commits across 10 branches, all 0 behind main.

### Lineage B — Independent

```
main (d6a4759)
 └─ feat/editor-drag-blocks ..... 5 commits  (units 13.1–13.2)
```

Branched directly from `main`. No shared commits with Lineage A. Touches different code (editor drag handle plugin, ProseMirror domain modules).

### Stale — Can Delete

```
feat/smart-linking-plan ......... 2 commits, 14 behind main
```

Planning branch superseded by the actual `feat/smart-linking` implementation. Safe to delete.

---

## Overlapping Files Between Lineages

The two lineages share changes in 3 code files and several doc files:

| File                                          | Nature of overlap                                                        | Conflict risk                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `src-tauri/tauri.conf.json`                   | Identical formatting change in both                                      | **None** (same diff)                                                  |
| `src/lib/features/editor/extensions/index.ts` | Stack adds slash command import+param; Drag adds drag handle import+call | **Low** — different lines, but adjacent imports may need manual merge |
| `src/styles/editor.css`                       | Stack adds `.SlashMenu__badge`; Drag adds `.block-drag-handle`           | **None** — different sections of the file                             |
| `carbide/*.md` (docs)                         | Both update work unit tracking docs                                      | **Low** — text-level, easy to resolve                                 |

---

## Ideal Merge Order

### Phase 1 — Merge the stack sequentially into main

Since the branches are linearly stacked, each merge is a fast-forward if done in order. **Merge from the bottom of the stack up:**

| #   | Branch                       | Merge type   | Units landed |
| --- | ---------------------------- | ------------ | ------------ |
| 1   | `feat/mcp-stdio`             | fast-forward | 1.1–1.5      |
| 2   | `feat/metadata-headings-cmd` | fast-forward | 2.1          |
| 3   | `feat/metadata-foundations`  | fast-forward | 3.1–3.3      |
| 4   | `feat/metadata-enrichment`   | fast-forward | 4.1–4.2      |
| 5   | `feat/smart-linking`         | fast-forward | 5.1–6.2      |
| 6   | `feat/http-cli`              | fast-forward | 7.1–8.2      |
| 7   | `feat/metadata-file-cache`   | fast-forward | 9.1          |
| 8   | `feat/plugin-hardening`      | fast-forward | 10.1–10.3    |
| 9   | `feat/block-embeddings`      | fast-forward | 11.1–11.2    |
| 10  | `feat/extended-tools`        | fast-forward | 12.1–12.5    |

**Shortcut:** Since the stack is linear, merging just `feat/extended-tools` into `main` brings all 72 commits at once (equivalent to steps 1–10 in a single fast-forward). Individual merges only matter if you want review gates between steps.

### Phase 2 — Merge the independent branch

| #   | Branch                    | Merge type           | Units landed |
| --- | ------------------------- | -------------------- | ------------ |
| 11  | `feat/editor-drag-blocks` | merge commit (3-way) | 13.1–13.2    |

This will require a merge commit since it diverged independently. Expect minor conflicts in `extensions/index.ts` (adjacent import lines) — trivial to resolve.

### Phase 3 — Cleanup

| Action | Branch                                                              |
| ------ | ------------------------------------------------------------------- |
| Delete | `feat/smart-linking-plan` (stale planning branch)                   |
| Delete | All 10 stack branches after merge (they're fully contained in main) |
| Delete | `feat/editor-drag-blocks` after merge                               |

---

## Alternative: Batch Merge by Review Gates

If merging per the batch schedule from the work units doc:

| Batch       | Merge up to                  | Review gate                                                   |
| ----------- | ---------------------------- | ------------------------------------------------------------- |
| A           | `feat/metadata-headings-cmd` | MCP stdio works; headings command callable                    |
| B           | `feat/metadata-enrichment`   | Type inference; frontmatter round-trip; ctime_ms + note_links |
| C           | `feat/smart-linking`         | Suggested Links panel with provenance                         |
| D           | `feat/http-cli`              | CLI read/search works; auto-config                            |
| E+F         | `feat/plugin-hardening`      | getFileCache; plugins lazy-load; plugin hardening             |
| F cont.     | `feat/extended-tools`        | Block embeddings; full MCP+CLI surface                        |
| G (partial) | `feat/editor-drag-blocks`    | Drag blocks work                                              |

---

## Phase 4 — Integrate `carbide-lite`

### Current State

`carbide-lite` is a **git worktree** (`/Users/abir/src/carbide-lite`) of the same repo, on the `carbide-lite` branch.

```
main (d6a4759)  ←── 20 commits ahead of merge base (bug fixes, v1.13.0, etc.)
    ↑
 271165d7 (merge base, pre-v1.13.0)
    ↓
carbide-lite ── 29 commits ahead of merge base
```

The lite branch is missing important main commits (omnifind freeze fix, find-in-file memory leak fix, LSP retry guard, etc.) plus all 72+ feature-stack commits.

### Scope of `carbide-lite` Changes

The lite branch is **not just config** — it's a full entrypoint fork:

| Category                                                            | Files                           | Lines                          |
| ------------------------------------------------------------------- | ------------------------------- | ------------------------------ |
| Lite shell/layout/UI (`src/lib/app/lite/`)                          | ~8 new Svelte files             | ~1500+                         |
| Full entrypoint extraction (`src/lib/app/full/`)                    | 5 new files                     | ~40                            |
| DI/bootstrap rewrite (`create_app_context.ts`)                      | 1 file                          | 789 lines changed              |
| Orchestration (actions, UI store, surfaces)                         | ~5 files                        | ~400                           |
| Rust feature gating (`app/mod.rs`, search, lint, LSP)               | ~10 files                       | ~800                           |
| Build config (Cargo.toml, tauri.lite.conf.json, vite, package.json) | ~5 files                        | ~100                           |
| Conditional UI wiring across features                               | ~20 files                       | ~200                           |
| Tests (lite boot, guard paths, smoke)                               | ~10 files                       | ~900                           |
| **Total**                                                           | **~64 source + ~15 test files** | **~7125 added, ~1449 removed** |

Cherry-picking config alone won't produce a buildable lite variant. The entrypoint split, DI wiring, and Rust feature gating are all required.

### Strategy: Rebase onto Updated Main

After Phases 1–3 complete (main has all feature work), rebase:

```bash
git rebase main carbide-lite
```

**Why rebase:**

- Keeps the 29 lite commits as a clean delta on top of current main
- Preserves all entrypoint/DI/UI work — this is needed for lite to build
- Main's bug fixes (omnifind freeze, find-in-file leak, LSP retry) flow in automatically as the new base

### Expected Conflicts

The feature stack mostly added **new modules** (MCP, smart_links, HTTP, CLI) that the lite branch never touched. Conflicts will concentrate in the shared bootstrap/DI wiring:

| Conflict area                  | Lite change                 | Feature stack change                   | Resolution pattern                                          |
| ------------------------------ | --------------------------- | -------------------------------------- | ----------------------------------------------------------- |
| `create_app_context.ts`        | Full/lite DI split          | New stores (MCP, smart links) wired    | Add new stores to full path, exclude from lite path         |
| `register_actions.ts`          | Full/lite action registries | New actions registered                 | Add new actions to full registry only                       |
| `reactors/index.ts`            | Full/lite reactor mounting  | New reactors (MCP autostart, etc.)     | Mount new reactors in full path only                        |
| `app/mod.rs` (Rust)            | Feature-gated init          | New Tauri commands registered          | Gate new commands behind `#[cfg(not(feature = "lite"))]`    |
| `Cargo.toml`                   | Feature flag definitions    | New crate deps (axum, clap, etc.)      | Add new deps as `optional`, include in default but not lite |
| Settings UI / shell components | Lite-specific layouts       | New settings panels (MCP, smart links) | Keep lite layout as-is; panels only render in full          |

**Estimate: ~10–15 conflicts.** Each follows a clear pattern: new feature code goes into the full path, lite path stays unchanged. No ambiguous resolutions expected.

### Execution

```bash
# 1. Start the rebase
git rebase main carbide-lite

# 2. For each conflict:
#    - New features → add to full entrypoint path
#    - Lite path → keep as-is (no new features)
#    - Rust → gate behind #[cfg(not(feature = "lite"))]
git add <resolved files>
git rebase --continue

# 3. Verify both variants build
CARBIDE_VARIANT=lite pnpm dev    # lite excludes full-only features
pnpm dev                          # full includes everything
```

### Post-Rebase Checklist

1. `CARBIDE_VARIANT=lite pnpm dev` — lite build starts, full-only features excluded
2. `CARBIDE_VARIANT=lite pnpm build` — production lite build succeeds
3. `pnpm dev` — full build includes all new features (MCP, smart links, CLI, etc.)
4. `pnpm check && pnpm lint && pnpm test` — pass for both variants
5. `cd src-tauri && cargo check --features lite` — Rust lite compiles
6. Bug fixes from main (omnifind, find-in-file, LSP retry) present in lite
7. New Rust modules (MCP, smart_links, HTTP, CLI) excluded from lite via `#[cfg]`

### Long-Term: Merge Lite Into Main

Once the rebase stabilizes, the eventual goal is to merge `carbide-lite` into `main` so both variants live on one branch behind build flags. The rebase is the bridge — it gets lite caught up with main so the merge is a clean fast-forward of the lite delta. At that point:

- `main` supports both variants via `CARBIDE_VARIANT`
- No separate branch needed
- The worktree becomes just a convenience for `CARBIDE_VARIANT=lite pnpm dev`
- New features automatically get lite exclusion via existing flag/entrypoint patterns

---

## Remaining Steps (Not Yet Branched)

These units from the work units doc have no branches yet:

| Step | Units     | Branch name (planned)    | Depends on             |
| ---- | --------- | ------------------------ | ---------------------- |
| 14   | 14.1–14.2 | `feat/metadata-events`   | Steps 4, 9 (merged)    |
| 15   | 15.1–15.2 | `feat/graph-smart-links` | Steps 5-6, 11 (merged) |
| 16   | 16.1–16.5 | per-feature branches     | All prior              |
