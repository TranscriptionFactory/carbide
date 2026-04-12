# Carbide — Remaining Work

**Date:** 2026-04-11
**Supersedes:** `2026-04-05_conversation_work_units.md`, `2026-04-11_unified_implementation_roadmap.md` (archived)

---

## Power Features

### Bulk Property Rename

**Session type:** Rust + TypeScript
**Design ref:** `carbide/mcp_native_gaps_plan.md` Phase 7 + `carbide/2026-04-05_plan_metadata_api_surface.md` 3d

- Tauri command + frontmatter writer integration
- UI confirmation dialog
- Git checkpoint before bulk operation, rollback on error
- Tests: multi-file rename, rollback on error

### Bulk Property Delete

**Session type:** Rust + TypeScript

- Same pattern as bulk rename
- Tests: multi-file delete, confirmation UI

### Nested Property Flattening

**Session type:** TypeScript
**Design ref:** `carbide/2026-04-05_plan_metadata_api_surface.md` 3e

- `extract_metadata.ts`: dot notation (`author.name`)
- Write-back preserves original YAML structure
- Tests: extraction, round-trip, edge cases


---

## Graph + Search Expansion

- Visual FTS overlay on graph view — highlight matching nodes, filter/dim non-matches, search-driven subgraph extraction
- Section-level / block-level graph edges when embeddings exist (partially scaffolded in D1, needs full implementation)

---

## Encryption (Revisit)

- Evaluate vault-level or note-level at-rest encryption
- Scope: key management UX, impact on indexing/search/MCP tools
- Architectural spike before implementation — decision needed first

---


## Editor Features

### Mermaid Polish

- Serial render queue + stale result guard
- Theme re-render on color scheme change (MutationObserver)

### Image Context Menu (Batch 4)

- `image_context_menu_plugin.ts` — right-click on images
- `image_context_menu.svelte` + `image_alt_editor.svelte`
- Actions: resize, copy image/URL, edit alt, open in browser, save as, delete

### Touch/Formatting Toolbar (Batch 5)

- `formatting_toolbar.svelte` + `formatting_toolbar_commands.ts`
- Toolbar: undo/redo, bold/italic/strike/code/link, H1-H3, quote, lists, code block, table, image, HR
- Show/hide via settings toggle or responsive breakpoint

### Contextual Command Palette

- `when?: (ctx: CommandContext) => boolean` on `CommandDefinition`
- `CommandContext` type (has_open_note, has_git_repo, has_git_remote, is_split_view)
- Filter `COMMANDS_REGISTRY` by `when` predicate in `search_omnibar`
- Contextual commands (note-only, git-only, split-view)

### AI Structured Edit Proposals

- Structured edit proposal contract for machine-validated AI payloads

---


## Cleanup

### Archive Stale Branches

**Depends on:** All hand-port work verified on `main`

```
git branch -m feat/plugin-hardening archive/feat/plugin-hardening
git branch -m feat/extended-tools archive/feat/extended-tools
git push origin archive/feat/plugin-hardening archive/feat/extended-tools
git push origin --delete feat/plugin-hardening feat/extended-tools
```

Inspect checkpoint commits on `feat/extended-tools` with `git diff` before archiving.

---

## Open Decisions (carried forward)

1. **`vault_contains` activation event** — deferred. Port when a concrete plugin needs vault-shape lazy activation.
2. **BUG-002B (undo history across tab switch)** — future work. Requires not destroying CodeMirror on tab switch — architectural change.
3. **`network.fetch` streaming (SSE/chunked)** — deferred. Add when a concrete use case emerges.
4. **`ai.execute` API transport** — deferred. Only CLI providers supported. Plugin authors can use `network.fetch` for direct API access.

# Deferred (likely permanately)

### Plugin SDK Package

**Session type:** TypeScript

- `@carbide/plugin-types` — type declarations extracted from internal ports
- `create-carbide-plugin` — scaffolding template
- Tests: type checking, template generation

### CLI TUI Mode

**Session type:** Rust

- ratatui or rustyline — exploratory, may span multiple sessions
- Tests: input handling, rendering