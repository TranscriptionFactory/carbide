# Smart Linking — Task Breakdown

Date: 2026-04-05
Status: proposed
Depends on: `carbide/implementation/2026-04-04_smart_linking_implementation_plan.md`

## Purpose

Translate the smart-linking implementation plan into concrete execution phases, file ownership, and near-term PR slices.

## Scope

This document covers smart linking only.

Block-level notes, block embeddings, and block-level suggestion UX remain out of scope except as future follow-up work.

## Phase 0 — Contracts and feature skeleton

### Frontend

Create:

```text
src/lib/features/smart_links/
├── index.ts
├── ports.ts
├── types/smart_link.ts
├── state/smart_links_store.svelte.ts
├── application/smart_links_service.ts
├── adapters/smart_links_tauri_adapter.ts
├── domain/default_rules.ts
└── domain/normalize_rule_config.ts
```

Tasks:

- define smart-link config/result types
- define `SmartLinksPort`
- create `SmartLinksStore`
- create `SmartLinksService`
- wire feature into `src/lib/app/di/create_app_context.ts`
- export public surface through `src/lib/features/smart_links/index.ts`

### Links feature contract changes

Update:

- `src/lib/features/links/state/links_store.svelte.ts`
- `src/lib/features/links/application/links_service.ts`
- `src/lib/features/links/ui/suggested_links_section.svelte`

Tasks:

- change `SuggestedLink` from semantic-only to generic scored suggestions
- rename `similarity` to `score`
- add `source`
- add `reasons`

### Backend

Create:

```text
src-tauri/src/features/smart_links/
├── mod.rs
├── model.rs
├── db.rs
└── service.rs
```

Tasks:

- define Tauri/Specta models for config and suggestions
- add command surface for config-backed suggestion computation
- register module in `src-tauri/src/app/mod.rs`

### Exit criteria

- frontend and backend compile with new contracts
- no behavior change yet when feature is disabled or unimplemented

## Phase 1 — Vault-scoped config persistence

### Frontend ownership

Files:

- `src/lib/features/smart_links/ports.ts`
- `src/lib/features/smart_links/adapters/smart_links_tauri_adapter.ts`
- `src/lib/features/smart_links/application/smart_links_service.ts`
- `src/lib/features/smart_links/domain/default_rules.ts`
- `src/lib/features/smart_links/domain/normalize_rule_config.ts`

Tasks:

- add `get_config(vault_id)`
- add `set_config(vault_id, config)`
- define default rules/weights
- normalize incomplete configs on load
- expose `load_config()` and `save_config()` from `SmartLinksService`

### Backend ownership

Files:

- `src-tauri/src/features/smart_links/service.rs`
- vault settings plumbing via existing settings commands/helpers

Tasks:

- persist config under vault settings key `smart_links`
- validate malformed data on read
- return normalized config to frontend

### Tests

Frontend:

- config defaulting
- config round-trip
- per-vault isolation

Backend:

- missing config returns defaults
- malformed config is sanitized

### Exit criteria

- config survives vault reopen
- config is scoped per vault
- no separate `.carbide/smart-links/rules.json` file exists in v1

## Phase 2 — Backend rule engine MVP

### MVP rules

Implement only:

- `same_day`
- `shared_tag`
- `shared_property`
- `citation_network`
- `semantic_similarity`

### Backend ownership

Files:

- `src-tauri/src/features/smart_links/db.rs`
- `src-tauri/src/features/smart_links/service.rs`
- possible helper reuse from:
  - `src-tauri/src/features/search/db.rs`
  - `src-tauri/src/features/search/vector_db.rs`
  - `src-tauri/src/features/search/service.rs`

Tasks:

- implement one SQL/query helper per metadata rule
- reuse note embedding KNN for semantic rule
- reuse linked-note exclusion behavior
- merge results by `target_path`
- aggregate weighted score
- sort descending
- truncate to requested limit
- preserve provenance for each rule hit

### Output shape

Return suggestion objects that include:

- target note metadata
- final score
- source kind
- rule reasons with per-rule scores

### Tests

Rust tests for:

- each rule in isolation
- multi-rule merge behavior
- self-exclusion
- already-linked exclusion
- graceful degradation when semantic lookup fails or is missing

### Exit criteria

- one backend call computes all enabled rule results
- metadata rules work even without embeddings
- semantic rule enhances rather than gates the result set

## Phase 3 — Links rail integration

### Frontend ownership

Files:

- `src/lib/features/links/application/links_service.ts`
- `src/lib/reactors/suggested_links_refresh.reactor.svelte.ts`
- `src/lib/features/links/ui/suggested_links_section.svelte`
- `src/lib/features/smart_links/application/smart_links_service.ts`

Tasks:

- make `LinksService.load_suggested_links()` delegate to `SmartLinksService`
- keep stale-request protection semantics
- keep reset/clear behavior intact
- map smart-link suggestions into `LinksStore`
- render score and lightweight provenance in the Suggested section
- keep insert action unchanged

### Tests

TS/Vitest:

- integration test for links service + smart links service
- stale response test
- disabled config test
- empty result test
- UI rendering test for multi-reason suggestions

### Exit criteria

- suggested links panel is powered by smart-link results
- panel remains responsive and deterministic

## Phase 4 — Minimal settings UI

### UI scope

Add a compact vault-scoped Smart Linking settings section.

Controls:

- master enable toggle
- per-rule enable toggle
- per-rule weight
- semantic threshold for semantic rule

### Files likely touched

- settings catalog / settings dialog wiring if reused
- smart-link-specific settings UI component(s)
- smart-links actions/service

### Constraints

- do not build a bases-style rule builder in v1
- keep the UI explicit and small
- store feature config separately from editor appearance settings

### Tests

- settings form load/save
- normalization on partial edits
- disabled rules not executed after save

### Exit criteria

- users can disable noisy rules
- users can rebalance rule influence without editing raw JSON

## Phase 5 — Polish and evaluation

### Tasks

- tune default rule weights
- identify noisy properties that should be excluded from `shared_property`
- evaluate whether tag/property rarity should influence scoring
- add short-lived request caching only if profiling shows need

### Deferred candidate rules

Do not start these until MVP is stable:

- `same_folder`
- `title_overlap`
- `shared_outlinks`
- composite rules

### Exit criteria

- default config produces useful suggestions in realistic vaults
- no premature expansion into low-signal heuristics

## BDD checklist

Implementation should explicitly cover these scenarios:

1. semantic-only config behaves like current semantic suggestions
2. metadata suggestions still work when embeddings are missing
3. one target suggested by multiple rules appears once with combined reasons
4. explicitly linked notes are not re-suggested
5. config is vault-scoped
6. stale responses do not overwrite newer note suggestions

## File-by-file ownership summary

### New frontend files

- `src/lib/features/smart_links/index.ts`
- `src/lib/features/smart_links/ports.ts`
- `src/lib/features/smart_links/types/smart_link.ts`
- `src/lib/features/smart_links/state/smart_links_store.svelte.ts`
- `src/lib/features/smart_links/application/smart_links_service.ts`
- `src/lib/features/smart_links/adapters/smart_links_tauri_adapter.ts`
- `src/lib/features/smart_links/domain/default_rules.ts`
- `src/lib/features/smart_links/domain/normalize_rule_config.ts`

### Existing frontend files likely touched

- `src/lib/app/di/create_app_context.ts`
- `src/lib/features/links/application/links_service.ts`
- `src/lib/features/links/state/links_store.svelte.ts`
- `src/lib/features/links/ui/suggested_links_section.svelte`
- `src/lib/reactors/suggested_links_refresh.reactor.svelte.ts`

### New backend files

- `src-tauri/src/features/smart_links/mod.rs`
- `src-tauri/src/features/smart_links/model.rs`
- `src-tauri/src/features/smart_links/db.rs`
- `src-tauri/src/features/smart_links/service.rs`

### Existing backend files likely touched

- `src-tauri/src/app/mod.rs`
- `src-tauri/src/features/search/db.rs` or shared helper surfaces reused from it
- `src-tauri/src/features/search/vector_db.rs` reuse only
- existing vault settings pathways if typed helper additions are needed

## Suggested PR slices

### PR 1 — contracts and config

- smart-links feature skeleton
- typed config/result models
- vault-scoped persistence
- no user-facing behavioral change

### PR 2 — backend MVP rule engine

- metadata rules
- semantic rule integration
- merge/scoring/provenance
- Rust tests

### PR 3 — links rail integration

- links service wiring
- UI score/provenance rendering
- TS tests

### PR 4 — settings UI

- vault-scoped smart-link controls
- config save/load polish

## Recommended execution order

1. backend models and commands
2. frontend smart-links feature slice
3. config persistence
4. metadata rules
5. semantic rule
6. links rail integration
7. settings UI
8. polish and deferred-rule review

## Final note

The key implementation discipline is to keep smart linking a note-level, backend-driven feature slice with explicit provenance.

If that remains true, the MVP stays aligned with Carbide’s architecture and avoids getting dragged into premature block-level complexity.
