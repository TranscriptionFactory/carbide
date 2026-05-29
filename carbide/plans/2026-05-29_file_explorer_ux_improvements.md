# File Explorer UX Improvements

> Analysis of current file explorer UX gaps and creative proposals for improvement.
> Date: 2026-05-29

---

## Current State

The file explorer is highly capable on paper — virtualized scrolling, 5 visual styles, fuzzy filter,
drag-and-drop, multi-select, blurb display, lazy pagination. The code is clean and well-structured.
But users report it feels "clunky."

### Friction Points

| Friction Point | Why It Feels Clunky |
|---|---|
| **Instant expand/collapse** — no animation | Jarring, feels like a debug UI |
| **No inline rename** — always a modal dialog | Breaks flow, feels heavyweight |
| **Filter is single-level** — type-and-hope, no saved queries | Useful for quick find, not for organization |
| **No breadcrumb** — deep hierarchy, no quick-return | Disorienting in large vaults |
| **No empty-state design** — expanding an empty folder shows nothing | Confusing, feels broken |
| **Settings buried** — file tree style settings hidden in the overloaded "Layout" tab | Undiscoverable |
| **Refresh is a no-op** in sidebar (deferred bug) | Violates user expectations |
| **Explorer is a single-dimensional hierarchy** — just folders | Fails when users have cross-cutting concerns |

### Related Bugs / Deferred Items

- **Refresh is a no-op** (carbide/2026-05-28_bugs_triaged.md#4.2): Refresh button doesn't rescan workspace.
- **Linked-source folders not visible in file tree** (carbide/2026-05-28_bugs_triaged.md#2.1): Deferred. Gated by `file_tree_show_linked_sources`.
- **Settings reorganization** (carbide/plans/2026-04-15_settings_panel_reorganization_plan.md): File tree settings should move to a dedicated "Sidebar" pane.
- **No filename prompt on paste** (artifacts, HTML paste): Users must rename via file tree as workaround.

### Architectural Gaps

- **Massive code duplication** in `workspace_layout.svelte`: Explorer and Starred `VirtualFileTree` blocks are ~95% identical (~40 props each).
- **No generic sidebar view dispatcher**: Each view type is a separate `{#if}` block.
- **`flatten_filetree` recomputes full tree on every derived change**: `sort_tree(build_filetree(...))` runs even when only expansion state changed.
- **Two independent expansion state systems**: Explorer uses `stores.ui.filetree.expanded_paths`, starred uses a local `SvelteSet` with `starred:` prefixes.
- **No external drag-and-drop into the tree**: Drop from OS not supported.
- **Pagination "load more" is scroll-only**: No button or keyboard shortcut to trigger the next page.

---

## Core Insight

The fundamental issue: **a static folder tree is a single, rigid dimension for organizing notes.**
Notes have tags, properties, links, modification times, semantic similarity — but the explorer only
shows the filesystem hierarchy. Users with sophisticated vaults (the ones who use graph view) want
the explorer to be *multi-dimensional*, not just a folder mirror.

---

## Creative / Novel Ideas

### 1. Pivot Views — Multi-Dimensional Explorer

Let users "pivot" the file tree by different axes. A toggle or dropdown at the top of the explorer
switches the organization mode:

| Pivot | Hierarchy |
|---|---|
| **By Folder** (current) | `folder/subfolder/note.md` |
| **By Tag** | `#tag/subtag/note.md` (virtual tree built from frontmatter tags) |
| **By Date** | `2026/05-May/29/note.md` (created or modified, like a calendar tree) |
| **By Link Count** | `Highly Connected/Moderately Connected/Orphan/` |
| **By Property** | Choose any frontmatter property — e.g. `status/draft/note.md`, `project/alpha/note.md` |
| **By Type** | `Notes/Canvases/Images/PDFs/` |

This is genuinely novel for note-taking apps. Obsidian needs plugins for this. It transforms the
explorer from a passive file mirror into an active organizational tool.

**Effort**: Medium. Each pivot reuses `build_filetree()` with a different grouping function.

---

### 2. Smart Collections (Saved Queries)

Virtual folders whose contents are live query results. They appear as special entries in the file
tree with a distinct icon. Persisted in vault config.

Examples:

- "Modified This Week" → `WHERE modified > now() - 7d ORDER BY modified DESC`
- "Urgent Drafts" → `WHERE tags CONTAINS 'urgent' AND props.status = 'draft'`
- "Orphan Notes" → `WHERE backlink_count = 0 AND NOT is_daily_note`
- "Needs Review" → `WHERE tags CONTAINS '#review' OR props.review_date < now()`

This gives users the power of the graph/search engine inside the familiar tree metaphor.
Think macOS Smart Folders meets SQL views.

**Effort**: Medium. Query engine already exists (FTS5 + property indexing). Needs a query builder
UI and virtual tree node type.

---

### 3. Contextual Sidebar (Activity-Aware Explorer)

When editing a note, the explorer adapts to show a "Related" section above the normal tree:

```
┌─ Related ──────────────────────────┐
│ ↖ Notes linking here     (3)       │
│ ↗ Notes linked from here (7)       │
│ # Shared tags: project-x, review   │
│ 🕐 Recently accessed in this folder │
├─ Files ────────────────────────────┤
│ ▼ project-alpha/                    │
│   ├─ design.md         ◉           │
│   ├─ tasks.md                      │
│   ...                              │
```

This is like Xcode's "Related Files" jump bar or VS Code's "Timeline" panel. It surfaces
connections *without* switching to the graph view — perfect for quick navigation while writing.

**Effort**: Low-Medium. Backlinks, tags, and recents are already indexed and available in stores.

---

### 4. Two-Pane Explorer (Column + List)

A mode that splits the explorer into two panes:

```
┌─ Folders ──────┬─ project-alpha/ ────────────────────┐
│ ▼ project-alpha │ Name        │ Modified    │ Links   │
│   ▼ specs/     │ design.md   │ 2 hours ago │ 7 ↗ 12 ↖│
│     ...        │ tasks.md    │ yesterday   │ 3 ↗ 5 ↖ │
│ ▼ project-beta  │ README.md   │ 3 days ago  │ 1 ↗ 8 ↖ │
│ ▼ archive/     │                             │         │
│                │ Filter: [________________] │ ⬆ Sort  │
└────────────────┴──────────────────────────────────────┘
```

The right pane is a flat, sortable, filterable list of the selected folder's contents. Displays
metadata columns (modification time, link counts, tags, size). Gives you macOS Finder's column view
merged with a data table — best of both worlds.

**Effort**: Medium-High. New component, but reuses existing `FlatTreeNode` data.

---

### 5. Peek Preview (Quick Look)

Press Space on any file to open a preview panel (not a full navigation):

```
┌──────────────────────────────────────┐
│ 📄 design.md                    [✕]  │
│ ──────────────────────────────────── │
│ # Design Document                     │
│                                       │
│ This document outlines the design     │
│ principles for the new component...   │
│                                       │
│ **Status:** draft                     │
│ **Tags:** #design #v2                 │
│                                       │
│ Backlinks: planning.md, tasks.md      │
│                                      │
│ [Open]  [Open to Side]  [Star]       │
└──────────────────────────────────────┘
```

Shows rendered first 10-15 lines of the note (ProseMirror/Markdown parser), key properties,
backlinks, and action buttons. No full page load — just a glance.

**Effort**: Medium. Needs a popover component + lightweight Markdown preview (markdown-it available).
`Escape` or click-outside dismisses.

---

### 6. Workspace Snapshots

Save the complete sidebar/editor state as a named workspace. A workspace captures:

- Which files are open and in what tab groups
- Which folders are expanded in the explorer
- Scroll position in the explorer
- Active sidebar view
- Panel sizes

Switch between "Morning Review", "Project X Sprint", "Research" workspaces instantly.

**Effort**: Medium. State is already centralized in stores; needs serialize/deserialize plus
a small management UI.

---

### 7. Progressive Disclosure & Smart Archive

- **Pinned Folders**: Right-click → "Pin to Top". Pinned folders appear in a "Pinned" section above
  the normal tree, always expanded.
- **Smart Archive**: Folders not accessed in >30 days auto-collapse into a collapsible "Archive"
  section at the bottom. Keeps the tree focused on active content.
- **Recent Section**: A small collapsed section at the top showing the last 5-8 notes you opened,
  like VS Code's "Open Editors."

**Effort**: Low-Medium. Mostly filtering and sectioning the existing `FlatTreeNode[]` array.

---

## High-Impact Polish Fixes

These are less novel but address the "clunky/unpolished" perception directly:

| # | Fix | Effort | Why It Matters |
|---|---|---|---|
| 8 | **Inline Rename** (F2/Enter to edit name in-place) | Low | Dialog-based rename is the #1 "feels clunky" culprit. VS Code and Finder both do inline. |
| 9 | **Animated expand/collapse** (CSS height transition) | Low | Instant jumps feel like a WIP. Smooth animation signals polish. |
| 10 | **Breadcrumb bar** at top of explorer | Low | Deep hierarchies need a "where am I" indicator. Clickable segments allow quick jumps. |
| 11 | **Empty folder state** ("This folder is empty — Create first note") | Low | Silence is confusing. A prompt turns confusion into action. |
| 12 | **Keyboard shortcut coverage** (Enter=rename, Cmd+N=new note, Delete=trash) | Low | Power users navigate by keyboard. Current shortcuts are incomplete. |
| 13 | **Auto-expand to active note** (sync tree with open tab) | Low | `revealed_note_path` exists but may not always trigger properly. |
| 14 | **Color tags/labels** (assign colors to files, show colored dots, filter by color) | Medium | macOS Finder tags are loved for a reason. Visual organization without changing structure. |
| 15 | **Scroll position persistence** (remember expanded folders + scroll when switching sidebar views) | Low | Losing your place is frustrating. Trivial to persist in the store. |
| 16 | **Sub-tabs within explorer** ("Files" \| "Starred" \| "Recent" \| "Open Editors") | Medium | Reduces need to switch sidebar views entirely. Keeps everything in one panel. |
| 17 | **External file drop** (drag from OS into tree to import) | Medium | Only internal drag-and-drop works now. External drop is a natural expectation. |
| 18 | **Fix refresh** (make the refresh button actually rescan) | Low | Deferred bug that erodes trust in the UI. |

---

## Implementation Sequencing

### Phase 1 — Polish (quick wins, high perception impact)

1. Inline rename (#8)
2. Animated expand/collapse (#9)
3. Empty folder states (#11)
4. Breadcrumb bar (#10)
5. Fix refresh button (#18)
6. Extract file tree settings into a "Sidebar" settings pane (see `carbide/plans/2026-04-15_settings_panel_reorganization_plan.md`)
7. Scroll position persistence (#15)
8. Auto-expand to active note (#13)
9. Keyboard shortcut coverage (#12)

### Phase 2 — Novel Features

1. Pivot views (#1) — highest differentiation value
2. Contextual sidebar (#3) — leverages existing graph/link data
3. Sub-tabs within explorer (#16)
4. Peek preview (#5)

### Phase 3 — Power Features

1. Smart Collections (#2)
2. Two-pane explorer (#4)
3. Workspace snapshots (#6)
4. Color tags (#14)
5. Progressive disclosure (#7)
6. External file drop (#17)

---

## Related Documents

- `carbide/2026-05-28_bugs_triaged.md` — Refresh no-op, linked-source visibility
- `carbide/plans/2026-05-28_bugs_implementation_plan.md` — Cross-cutting linked-source refactor
- `carbide/plans/2026-04-15_settings_panel_reorganization_plan.md` — Settings pane extraction
- `docs/architecture.md` — Decision tree and layered architecture guidance
