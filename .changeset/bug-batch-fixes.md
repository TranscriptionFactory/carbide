---
"carbide": patch
---

### Fixes

- **Inline AI replaces the selection (BUG-1)**: `start_stream` now deletes the active selection in the same transaction before anchoring the AI range, so generated text replaces the selection instead of being shoved beside it. The pristine pre-AI document is snapshotted once on `open` (survives retries), and a first-class `retry` action deletes the previous AI range and re-streams the cached prompt rather than firing an unknown `"retry"` command id — fixing both "Try again" appending a second generation and reject-after-retry failing to restore the original doc.

- **Terminal Option+Arrow word motion (BUG-3)**: removed `macOptionIsMeta:true` so xterm.js emits the standard escape sequences that default zsh/bash readline bindings recognise, restoring word-by-word cursor movement.

- **Drill-down file explorer context menu (BUG-4)**: drill-down rows are now wrapped in `ContextMenu.Root` with star / copy-path / open-to-side / reveal / rename / delete actions, mirroring the tree-row affordances via the same optional callback props.

- **Linked source resolution by existence, portable anchors first (BUG-5)**: resolution preferred the absolute `external_file_path` recorded on the indexing machine over the portable anchors, so on a second machine the stale path made sources look missing. `resolve_linked_path` (scan relocation) now prefers vault-relative then home-relative anchors and treats `external_file_path` as a cache hint; the Rust open/preview resolver builds candidates in portability order and returns the first that exists on disk, falling back to the most-portable candidate. `linked_source_list_files` is bounded by a 5s timeout so an unreachable mount returns promptly, and a new "Refresh sources" action re-validates and rescans on demand.

- **Task-query embed shows the leaf section, full path on hover (BUG-6)**: the embed renderer no longer sets the full slash-joined ancestry as visible text; section labels are centralised through `leaf_of_section` / `full_section_path` so embed and the Svelte component both show the leaf with the full path in the `title` attribute.

- **HTML document scroll persists across tab switches (BUG-7)**: added `initial_scroll_top` / `on_scroll_change` plumbing to `html_viewer.svelte` and `html_live_renderer.svelte`. The safe viewer reads/writes scroll via `contentDocument.scrollingElement` with a debounce; the document content wrapper passes through `viewer_state.scroll_top`, matching the existing code/csv viewer pattern.

- **Problems panel severity filter (BUG-8)**: replaced the binary log/diagnostics toggle with two orthogonal axes — Stream (all / diagnostics / logs) and Severity (all / error / warning / info / hint / debug / trace). The pure filter/merge logic is extracted into `problems_panel_filter.ts` for direct unit testing; "all" merges both streams sorted by timestamp.

- **Tag palette fuzzy/hierarchical matching (BUG-9)**: `handle_tag_suggest_query` and `handle_at_palette_tag_query` now use `rank_tags` from `tag_matcher` instead of `startsWith`, so hierarchical, substring, and fuzzy scoring apply to both palettes and ranked order is preserved.
