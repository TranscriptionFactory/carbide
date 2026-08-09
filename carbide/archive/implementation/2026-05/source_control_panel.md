# Source Control Sidebar Panel

## Context

The design file `v2/Carbide v2 · Lattice.html` specifies a rich source control panel with staged/unstaged file management, checkpoint history timeline, and a commit composer. This is implemented as a new sidebar view (`"source_control"`) accessible from the existing activity bar — matching how Tasks, Tags, Graph, etc. are already wired.

Editor paragraph-level change rails are deferred to a follow-up.

## Design Reference

The source control panel (`V2SourceControl` in `app2.jsx`) is a 3-section vertical panel:

1. **Branch header** — branch name, pull/push buttons, stat ribbon (files, staged, +additions, −deletions)
2. **File sections** — collapsible "Staged" and "Changes" (unstaged) sections with per-file change cards that show status badge, filename, folder, +/− counts, expandable inline diff peek, and stage/unstage toggle
3. **Checkpoints** — collapsible commit history timeline grouped by day, spine dots (accent for AI, muted for manual), commit title/hash/time/±
4. **Commit composer** (bottom-pinned) — textarea for checkpoint name, "Checkpoint N files" button, amend button, optional AI-drafted badge

## Implementation Steps

### Step 1: Extend GitStore with changed files + staging state

**File:** `src/lib/features/git/state/git_store.svelte.ts`

The store currently tracks `pending_files` (count only). The status response already returns `files: GitFileStatus[]` but the store discards them.

Add:
```ts
changed_files = $state<GitFileStatus[]>([]);
staged_paths = $state(new SvelteSet<string>());
```

Add derived getters:
```ts
get staged_files() { return this.changed_files.filter(f => this.staged_paths.has(f.path)); }
get unstaged_files() { return this.changed_files.filter(f => !this.staged_paths.has(f.path)); }
```

Add methods:
```ts
stage_file(path: string)
unstage_file(path: string)
stage_all()
unstage_all()
toggle_stage(path: string)
```

Update `set_status()` to store `status.files` into `changed_files`, and clean up `staged_paths` for files no longer in the change set.

### Step 2: Add git staging action IDs + handlers

**Files:**
- `src/lib/app/action_registry/action_ids.ts` — add `git_stage_file`, `git_unstage_file`, `git_stage_all`, `git_unstage_all`, `git_commit_staged`
- `src/lib/features/git/application/git_actions.ts` — register handlers that call store methods for stage/unstage, and use existing `git_port.stage_and_commit(vault_path, message, staged_paths)` for commit
- `src/lib/features/git/application/git_service.ts` — add `commit_staged(message: string)` method that commits only the staged files list

### Step 3: Add "source_control" to activity bar

**File:** `src/lib/app/bootstrap/ui/activity_bar.svelte`

Add a `GitBranch` icon button (from `@lucide/svelte`) for `"source_control"` view, placed after Tasks (inside the `is_vault_mode` block). Add `on_open_source_control` callback prop.

**File:** `src/lib/app/bootstrap/ui/workspace_layout.svelte`

Wire the activity bar callback:
```ts
on_open_source_control={() => {
  if (stores.ui.sidebar_open && stores.ui.sidebar_view === "source_control") {
    void action_registry.execute(ACTION_IDS.ui_toggle_sidebar);
    return;
  }
  void action_registry.execute(ACTION_IDS.ui_set_sidebar_view, "source_control");
}}
```

Add the sidebar content block:
```svelte
{#if is_vault_mode && stores.ui.sidebar_view === "source_control"}
  <Sidebar.Group class="h-full">
    <Sidebar.GroupContent class="h-full">
      <SourceControlPanel />
    </Sidebar.GroupContent>
  </Sidebar.Group>
{/if}
```

### Step 4: Create SourceControlPanel component

**New file:** `src/lib/features/git/ui/source_control_panel.svelte`

Top-level panel component. Reads from git store via app context. Contains:
- Branch header with stat ribbon
- `<ChangeCard>` instances in collapsible "Staged" and "Changes" sections
- `<CheckpointHistory>` for commit timeline
- `<CommitComposer>` pinned at bottom

All sub-sections are collapsible with chevron toggles.

### Step 5: Create ChangeCard component

**New file:** `src/lib/features/git/ui/change_card.svelte`

Per-file card with:
- Left color border based on status (M=warning, A=indicator-clean, D=destructive)
- Status badge, filename (stripped .md), folder path, +/− counts
- Expand button → shows inline diff hunks (lazy-loaded via `git_service.get_diff`)
- Stage/unstage toggle button (checkbox-like)

### Step 6: Create CheckpointHistory component

**New file:** `src/lib/features/git/ui/checkpoint_history.svelte`

Timeline view of commits grouped by day. Reuses `GitStore.history` data.

- Day header labels ("Today", "Yesterday", date)
- Spine line with dots (accent-colored for AI-generated, muted for manual)
- Per-commit: title, short hash, time, +/− stats
- Hover highlight
- Trigger `git.load_more_history` action for pagination

### Step 7: Create CommitComposer component

**New file:** `src/lib/features/git/ui/commit_composer.svelte`

Bottom-pinned composer:
- Textarea for checkpoint message
- Primary "Checkpoint N files +X −Y" button (disabled when no staged files or empty message)
- Amend button (secondary)
- Triggers `git.commit_staged` action

### Step 8: Update git feature index

**File:** `src/lib/features/git/index.ts`

Export: `SourceControlPanel`

### Step 9: Load history when source control view opens

When the sidebar switches to `"source_control"`, trigger `git.refresh_status` and load vault-level history. This can be an `$effect` in the panel component or an action handler.

## Critical Files

**Modified:**
- `src/lib/features/git/state/git_store.svelte.ts` — changed_files, staged_paths, methods
- `src/lib/features/git/application/git_actions.ts` — staging actions
- `src/lib/features/git/application/git_service.ts` — commit_staged method
- `src/lib/app/action_registry/action_ids.ts` — new action IDs
- `src/lib/app/bootstrap/ui/activity_bar.svelte` — source control button
- `src/lib/app/bootstrap/ui/workspace_layout.svelte` — source control sidebar view
- `src/lib/features/git/index.ts` — export SourceControlPanel

**New:**
- `src/lib/features/git/ui/source_control_panel.svelte`
- `src/lib/features/git/ui/change_card.svelte`
- `src/lib/features/git/ui/checkpoint_history.svelte`
- `src/lib/features/git/ui/commit_composer.svelte`

## Existing Code to Reuse

- `GitPort.stage_and_commit(vault_path, message, files)` — already supports file-specific commits
- `GitPort.status()` returns `files: GitFileStatus[]` — file list with status
- `GitPort.log()` — commit history
- `GitPort.diff()` — diff between commits for inline peek
- `GitStore.history` + `set_history()` — commit history state
- `GitService.refresh_status()` — status refresh
- `GitService.load_history()` — history loading with caching
- `GitDiffView` (`git_diff_view.svelte`) — existing diff rendering (reuse or adapt)
- `Sidebar.*` components — sidebar group/content wrappers
- Action registry pattern from existing sidebar views (tasks, tags, graph)

## Verification

1. `pnpm check` — TypeScript compiles
2. `pnpm lint` — Layering rules pass
3. `pnpm test` — Existing tests pass
4. `pnpm format` — Formatted
5. Manual: Open app → click source control icon in activity bar → verify panel shows with sections for staged/unstaged files, checkpoint history, and commit composer
