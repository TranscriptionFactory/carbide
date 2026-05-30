---
"carbide": minor
---

### Features

- **File explorer UX overhaul (Phase 1 + 2)**: a coordinated pass on the sidebar / editor relationship driven by `carbide/plans/2026-05-29_file_explorer_ux_improvements.md`.
  - **Path breadcrumb above the editor**: renders `vault → ancestor folders → current note` whenever a note is open. Ancestor clicks reveal the folder in the file tree (expand path, select, switch sidebar to explorer); the trailing note segment re-reveals the active note. New `filetree_reveal_folder` action mirrors `filetree_reveal_note` for folder targets.
  - **Finder-style drill-down explorer mode**: `DrillDownFileTree` renders one folder at a time with an "up" row and single-click activation. A new `filetree.toggle_mode` action flips between the tree and drill-down views in the explorer header; the choice persists via the existing `EditorSettings.file_tree_mode` field. Navigation reuses `filetree_reveal_folder` so the breadcrumb works as ancestor nav.
  - **Files / Views sub-tabs in the sidebar**: the explorer pane now has a Files tab (the existing virtualized tree) and a Views tab that lists the vault's saved bases views (`.carbide/bases/*.json`). Clicking a view loads it and switches the sidebar to the bases panel. New `ui.explorer_subtab` UIStore state and `ui.select_explorer_subtab` action wire it up; `dispatches bases_list_views` when switching to Views.
  - **Folder-note click-through**: single-clicking a folder in either tree or drill-down mode now opens the matching folder note (`folder/<basename>.md`) when one exists, gated to the expand transition so a collapse no longer steals tab focus. Uses the same same-name convention enforced by link resolution.
  - **Hover-peek preview in drill-down view**: `PeekTooltip` shows a small floating popover (title + path + blurb) after 500 ms hover, reusing `NoteMeta.blurb` so the feature requires no I/O. Wired into `DrillDownFileTree` for v1.
  - **Drag-and-drop wikilink insertion**: dragging a markdown file from the tree onto the editor now inserts `[[basename]]` via the new `build_wiki_link` helper. Non-markdown paths still produce the existing relative file links; mixed drops produce a mix.
  - **Cmd+P pre-fill from the focused folder**: when the omnibar opens with an empty query and focus is inside a `[data-vim-nav-region="file_tree"]` subtree, it pre-fills the query with the selected folder path (suffixed with `/`) and immediately runs the prefixed search.

- **Bases: tree view mode + group_by config**: new `tree` `ViewMode` that nests rows under multi-level grouping by property values (e.g. `["tags", "status"]`). Empty `group_by` falls back to a flat row list so the mode is always usable. Rust `BaseViewDefinition` now persists kanban / calendar / tree configs; previously kanban/calendar were silently dropped on save round-trip.

- **Bases: default saved views seeded on first vault open**: new `bases_seed_default_views` Tauri command writes six default views (By Tag, By Created Month, By Status, Modified This Week, Orphan Notes, Smart Archive) to `.carbide/bases/`. A `.carbide/bases/.seeded` sentinel prevents re-seeding. Seeds requiring a frontmatter property are skipped when that property isn't present in the vault.

- **Context rail: Related tab with siblings + tag chips**: new `RelatedPanel` surfaces (1) recent notes in the current folder, (2) siblings of the open note (same parent folder), and (3) shared-tag chips. Clicking a tag chip pivots the sidebar to bases with a tag filter applied. Added as a fourth tab on the existing `ContextRail` (Compass icon).

### Fixes

- **Refresh button now rescans the filesystem**: the sidebar refresh action invalidated UI-side state and reloaded every previously-expanded folder, but the Rust folder-listing cache (30s TTL) returned stale entries within that window, so files added or removed externally weren't picked up. New `clear_folder_cache(vault_id)` Tauri command drops every cache entry for the vault, and runs at the start of `folder_refresh_tree` before the per-folder reloads.

- **Bases `now()` / `mtime` filters wired up**: the default "Modified This Week" and "Smart Archive" views were dead because `now()-Nd` values were never substituted and `modified` / `accessed` were read as frontmatter props. `query_bases` now resolves `now()` / `now()-Nd` to epoch-ms and maps `modified→mtime_ms`, `created→ctime_ms`, `accessed→mtime_ms` (accessed is a mtime proxy; no atime tracked). Both seeds are ungated so they return rows; Orphan Notes stays gated until `backlink_count` becomes a computed column.

### Notes

- Includes the `2026-05-29_file_explorer_ux_improvements.md` planning doc that scoped Phase 1 + 2 of this work.
