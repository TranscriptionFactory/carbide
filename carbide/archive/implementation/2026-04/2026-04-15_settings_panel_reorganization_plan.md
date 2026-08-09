---
title: "Settings Panel Reorganization"
date: 2026-04-15
status: draft
---

## Problem

The settings dialog has 13 nav categories, but they are poorly balanced. Some panes are overloaded, others nearly empty, and category labels in `settings_catalog.ts` don't match the UI. Users scrolling through Layout must wade through ~25 settings with ad-hoc sub-sections ("Reading", "Blocks", "Links", "Dividers"), while Misc and MCP are one-toggle panes. The Toolchain page crams three conceptually distinct features (linting, LSP, references) into one long scroll.

## Audit: Current State

| Pane | # Settings (approx) | Notes |
|---|---|---|
| Theme | ~15 (via ThemeSettings) | Well-scoped, self-contained |
| AI | 3 + provider mgmt | Reasonably sized |
| **Layout** | **~25** | Overloaded: file tree, editor reading, blocks, links, dividers, toolbar, outline, tabs |
| Files | 6 | Appropriately sized |
| Git | 5 | Appropriately sized |
| Documents | 5 | Appropriately sized |
| Terminal | 11 | Denser but coherent |
| Graph | 4 | Reasonable |
| Semantic | 7 + Smart Links | Reasonable |
| **MCP** | **1** | Too sparse for a dedicated pane |
| **Misc** | **1 + storage actions** | Only "Show vault dashboard" is a real setting; rest are maintenance actions |
| Tools | 4 lint + 3 LSP + 3 refs + tool mgmt | Three domains crammed together |
| Hotkeys | 1 (vim) + keybind panel | Needs vim toggle moved elsewhere |

### Specific Issues

1. **Layout is a dumping ground.** It mixes sidebar settings (file tree), editor reading/typography, block styling, link styling, divider styling, and navigation (outline, toolbar, tabs). No clear thread.
2. **Misc is functionally empty.** "Show vault dashboard on open" is a startup/navigation preference, not a miscellaneous grab-bag item. The storage/cleanup section is maintenance, not configuration.
3. **MCP is a single toggle.** Not enough to justify its own pane.
4. **Toolchain merges three features.** Linting, LSP, and Reference Manager are different features with different user profiles. A user who wants reference citations shouldn't have to scroll past rumdl and LSP config.
5. **Catalog ↔ UI mismatch.** The `settings_catalog.ts` declares categories like `"Navigation"` and `"Toolchain"`, but the dialog renders `"Misc"` and `"Tools"` respectively. `file_tree_show_linked_sources` is `"Navigation"` in the catalog but lives in Layout in the UI. `vim_nav_enabled` is `"Navigation"` in the catalog but lives in Hotkeys in the UI.
6. **Hotkeys pane holds vim nav.** The vim toggle is a navigation preference, not a hotkey customization.

## Proposed New Structure

### Pane: Editor (replaces Layout — editor-facing items)

Settings that control how content appears and behaves inside the editor pane.

| Setting | Current Location | Sub-section |
|---|---|---|
| editor_max_width_ch | Layout | Reading |
| editor_heading_spacing_density | Layout → Reading | Reading |
| editor_heading_markers | Layout → Reading | Reading |
| editor_paragraph_spacing_density | Layout → Reading | Reading |
| editor_list_spacing_density | Layout → Reading | Reading |
| editor_table_spacing_density | Layout → Reading | Reading |
| editor_selection_color | Layout → Reading | Reading |
| editor_spellcheck | Layout → Blocks | Reading |
| source_editor_line_numbers | Layout → Blocks | Reading |
| editor_code_block_padding | Layout → Blocks | Blocks |
| editor_code_block_radius | Layout → Blocks | Blocks |
| editor_code_block_wrap | Layout → Blocks | Blocks |
| editor_blockquote_padding | Layout → Blocks | Blocks |
| editor_blockquote_border_width | Layout → Blocks | Blocks |
| editor_block_drag_handle | Layout → Reading | Blocks |
| editor_block_drag_handle_visibility | Layout → Reading | Blocks |
| editor_toolbar_visibility | Layout | Reading |
| outline_mode | Layout | Reading |
| editor_link_underline_style | Layout → Links | Links |
| editor_divider_style | Layout → Dividers | Dividers |
| editor_divider_thickness_px | Layout → Dividers | Dividers |
| editor_divider_color | Layout → Dividers | Dividers |
| editor_divider_spacing | Layout → Dividers | Dividers |

Sub-sections within Editor (mirroring current Layout sub-headers): **Reading**, **Blocks**, **Links**, **Dividers**.

### Pane: Sidebar (new — extracted from Layout)

Settings controlling the left sidebar file browser and navigation.

| Setting | Current Location |
|---|---|
| file_tree_style | Layout |
| file_tree_show_blurb | Layout |
| file_tree_blurb_position | Layout |
| file_tree_show_linked_sources | Layout (catalog says "Navigation") |
| max_open_tabs | Layout |

### Pane: Navigation (new — consolidated)

Behavioral navigation and startup preferences.

| Setting | Current Location |
|---|---|
| show_vault_dashboard_on_open | Misc |
| vim_nav_enabled | Hotkeys |

### Pane: Integrations (replaces Misc + MCP + part of Tools)

External systems and connections. Grouping MCP, Smart Links, and References here makes conceptual sense: these are features that connect Carbide to outside systems.

| Setting/Sub-section | Current Location |
|---|---|
| mcp_enabled | MCP |
| Smart Links rules section | Semantic |
| reference_enabled | Tools |
| reference_citation_style | Tools |
| reference_include_sources_in_search | Tools |

### Pane: Toolchain (renamed from Tools, narrowed)

Tool installation and linting only. LSP config stays here since it's a language server tool.

| Setting/Sub-section | Current Location |
|---|---|
| Tool install/uninstall UI | Tools |
| lint_enabled | Tools |
| lint_format_on_save | Tools |
| lint_formatter | Tools |
| lint_rules_toml | Tools |
| rumdl_binary_path | Tools |
| markdown_lsp_enabled | Tools |
| markdown_lsp_provider | Tools |
| markdown_lsp_binary_path | Tools |
| iwe_ai_provider_id | Tools |

### Pane: Semantic (unchanged scope)

Stays as-is: embedding toggles, similarity threshold, suggested links limit, graph edges, max vault size, omnibar toggle. Smart Links moves out to Integrations.

### Other panes: unchanged

Theme, AI, Files, Git, Documents, Terminal, Graph — all stay as currently scoped.

### Hotkeys pane: narrowed

Remove vim_nav_enabled. Only contains the interactive hotkey rebinding panel.

## Summary of Changes

| Current Pane | Action | New Pane(s) |
|---|---|---|
| Layout (25 items) | Split | Editor (~23), Sidebar (5) |
| Misc (1 setting + actions) | Dissolve | Navigation (2 settings), Storage actions → Toolchain footer or a "Data" sub-section under Toolchain |
| MCP (1 toggle) | Merge into | Integrations |
| Tools | Split | Toolchain (linting + LSP + tool mgmt), references → Integrations |
| Hotkeys | Move vim toggle out | Navigation gets vim toggle; Hotkeys stays as keybind panel |
| Semantic | Remove Smart Links | Smart Links → Integrations |

## New Nav Order

```
1.  Theme        (PaletteIcon)
2.  Editor       (LayoutIcon)       — renamed from "Layout"
3.  Sidebar      (PanelLeftIcon)    — NEW
4.  Files        (FolderIcon)
5.  Git          (GitBranchIcon)
6.  Documents    (FileTextIcon)
7.  Terminal     (TerminalIcon)
8.  Graph        (NetworkIcon)
9.  Semantic     (BrainIcon)
10. AI           (SparklesIcon)
11. Integrations (CableIcon)        — replaces MCP + Misc + References
12. Toolchain    (WrenchIcon)       — narrowed
13. Navigation   (CompassIcon)      — NEW (from Misc + vim)
14. Hotkeys      (KeyboardIcon)     — vim toggle moved out
```

Rationale for ordering: presentation/appearance first (Theme, Editor, Sidebar), then core content features (Files, Git, Documents), then workspace tools (Terminal, Graph, Semantic, AI), then integrations and tooling, then behavioral preferences (Navigation, Hotkeys).

## Implementation Plan

### Phase 1: Type system updates

1. Update `SettingsCategory` type in `editor_settings.ts`:
   - Remove `"layout"` → add `"editor"` and `"sidebar"`
   - Remove `"misc"` → add `"navigation"` and `"integrations"`
   - Remove `"mcp"` (merged into `"integrations"`)
   - Rename toolchain references to stay as `"toolchain"` (not `"tools"`)

2. Update `categories` array in `settings_dialog.svelte` with new ordering and icons.

3. Update `settings_catalog.ts` categories to match (e.g., `"Layout"` → `"Editor"` / `"Sidebar"`, `"Misc"` → `"Navigation"`, etc.).

### Phase 2: UI restructuring

4. **Split `Layout` block** in `settings_dialog.svelte`:
   - Extract all file-tree items into a new `Sidebar` pane section.
   - Move `max_open_tabs` to Sidebar (tabs are a sidebar concern).
   - Rename remaining `Layout` section to `Editor`, keeping sub-section headers (Reading, Blocks, Links, Dividers).

5. **Dissolve `Misc`** pane:
   - Move `show_vault_dashboard_on_open` to new `Navigation` pane.
   - Move Storage & Cleanup section to a new sub-section at the bottom of `Toolchain` (or make it a standalone "Data" pane — recommendation: keep it under Toolchain with a clear divider).

6. **Merge `MCP` into `Integrations`** pane:
   - Move `McpSettings` component into new `Integrations` pane.
   - Move `SmartLinksSettings` from Semantic into Integrations.
   - Move References section (reference_enabled, reference_citation_style, reference_include_sources_in_search) from Toolchain into Integrations.

7. **Extract `vim_nav_enabled`** from Hotkeys pane into Navigation pane.

8. **Remove `{:else if active_category === "mcp"}`** and `{:else if active_category === "misc"}` blocks, replace with `integrations` and `navigation`.

### Phase 3: Surgical component extraction

The `settings_dialog.svelte` file is 4400 lines. Each pane should be extracted into its own component for maintainability.

9. Create individual pane components under `src/lib/features/settings/ui/panes/`:
   - `editor_pane.svelte`
   - `sidebar_pane.svelte`
   - `navigation_pane.svelte`
   - `integrations_pane.svelte`
   - (Existing pane components like `ThemeSettings` already exist)

10. Each pane receives `editor_settings`, `update()`, and relevant sub-props. This reduces the monolithic dialog to a router that delegates to pane components.

11. The `settings_dialog.svelte` becomes ~200 lines: dialog shell, nav, and `{#each categories}` dispatching to pane components.

### Phase 4: Update search catalog

12. Verify `SETTINGS_REGISTRY` categories in `settings_catalog.ts` align with new panes for the command-palette search. Example mappings:
    - `file_tree_*` → `"Sidebar"`
    - `editor_*` → `"Editor"`
    - `show_vault_dashboard_on_open` → `"Navigation"`
    - `vim_nav_enabled` → `"Navigation"`
    - `reference_*` → `"Integrations"`
    - `mcp_*` → `"Integrations"`
    - `semantic_*` → `"Semantic"` (keep, but Smart Links doesn't have a setting key)

### Phase 5: Migration & tests

13. Add migration for stored `active_category` preference: map `"layout"` → `"editor"`, `"misc"` → `"navigation"`, `"mcp"` → `"integrations"`.

14. Update existing settings tests to cover new category routing.

15. Visual verification: every setting should appear exactly once in the new layout. No orphaned settings.

## Settings Count Per Pane (Projected)

| Pane | Count | Assessment |
|---|---|---|
| Theme | ~15 | Good |
| Editor | ~23 | Dense but well-structured with sub-sections |
| Sidebar | 5 | Compact, coherent |
| Files | 6 | Good |
| Git | 5 | Good |
| Documents | 5 | Good |
| Terminal | 11 | Dense but coherent |
| Graph | 4 | Good |
| Semantic | 5 | Streamlined (Smart Links moved) |
| AI | 3+ | Good |
| Integrations | 6 (MCP toggle + Smart Links + 3 refs) | Good |
| Toolchain | 10 + storage actions | Dense but single-topic |
| Navigation | 2 | Compact (but meaningful — these are behavioral prefs) |
| Hotkeys | panel only | Just the keybinding UI |

The only pane that could feel sparse is **Navigation** (2 items). This is acceptable because:
- Both are behavioral navigation toggles that don't belong elsewhere
- The pane will grow as navigation features are added (e.g., default startup view, sidebar position, etc.)
- It eliminates the "Misc" catch-all anti-pattern

## Open Questions

1. **Should Toolchain's storage/cleanup section stay or get its own "Data" pane?** Recommendation: keep it in Toolchain as a sub-section. It's already maintenance/tooling adjacent. Only promote to its own pane if it grows significantly.

2. **Should `max_open_tabs` be in Sidebar or Editor?** Tabs are a UI chrome concern. Arguments for either. Recommendation: Sidebar (since the tab bar is part of the editor frame, but the file tree relationship is stronger). Alternative: Editor. Decided by product preference.

3. **Should the pane extraction (Phase 3) be done atomically with Phase 2 or as a follow-up?** Recommendation: Phase 2 first (category reshuffling), Phase 3 as a follow-up. This lets us validate the information architecture before doing structural refactoring.

4. **Icon for Navigation pane?** Suggested: `CompassIcon` from lucide. Alternatives: `NavigationIcon`, `RouteIcon`.