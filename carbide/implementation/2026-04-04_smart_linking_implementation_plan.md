# Smart Linking — Implementation Plan

Date: 2026-04-04
Status: proposed
Scope: smart linking only

## Goal

Ship smart linking as a note-level feature that surfaces high-signal suggested links in the existing links rail, without taking on block-level indexing or block-level note UX in the MVP.

## Scope boundary

This plan intentionally excludes block-level notes.

Block-level indexing, embeddings, and anchor-aware suggestions are relevant only as future optimizations once note-level smart linking is stable, measured, and worth making more precise.

## What exists today

### User-facing surface

- `LinksService.load_suggested_links()` already powers the Suggested section in the links rail.
- That flow is semantic-only: it calls `SearchPort.find_similar_notes()` and maps `distance -> similarity`.
- Refresh is driven by `suggested_links_refresh.reactor.svelte.ts` when the links rail is open.
- UI already supports a ranked list with an insert action in `suggested_links_section.svelte`.

### Backend/query primitives already available

- `find_similar_notes()` exists in Rust and already excludes existing backlinks/outlinks when requested.
- Search DB already indexes the signals we need for note-level rules:
  - `notes` metadata including `mtime_ms`, `path`, `linked_source_id`
  - `note_properties`
  - `note_inline_tags`
  - `outlinks`
- The reference model already exposes linked-source identity through `notes.linked_source_id`.

### Architectural constraint from `docs/architecture.md`

This should be implemented as a proper feature slice:

- async orchestration in a service
- IO behind a port/adapter boundary
- state in a store
- links rail integration through actions/services/reactors
- no component-to-service shortcuts

## Product decisions

### D1. Smart linking is note-level first

The source and target of a smart-link suggestion are notes, not blocks.

That keeps the API, UI, and ranking model aligned with the existing `Suggested` links section and with current `find_similar_notes()` semantics.

### D2. Smart linking should not be “just semantic search with a different label”

The MVP should combine multiple cheap note-level signals and return provenance for each suggestion.

That means the feature is only worth shipping if the result shape can explain _why_ a note was suggested.

### D3. Keep existing semantic display settings, add vault-scoped smart-link config separately

Current editor settings already contain:

- `semantic_similarity_threshold`
- `semantic_suggested_links_limit`

Those can remain as display/runtime knobs for the existing rail behavior.

Smart-link rule configuration should be stored separately as vault-scoped domain config, not folded into `EditorSettings`, because it is feature data, not editor appearance/preferences.

### D4. Use vault settings for v1 persistence, not a new `.carbide/smart-links/rules.json` file

The proposal suggested a dedicated JSON file. The cleaner v1 move is to persist under the existing vault settings infrastructure via a dedicated key such as `smart_links`.

Why:

- the app already has a generic vault settings read/write path
- no new config file lifecycle is needed
- browse-mode and write-guard behavior already exists
- it matches the current architecture better than introducing a one-off config path

A standalone file can still be added later if import/export or hand-editability becomes important.

### D5. Integrate through the links feature, but keep smart-linking logic in its own feature slice

Do not keep growing `LinksService` into a rule engine.

Instead:

- add a new frontend feature: `smart_links`
- let `links` remain the owner of the links rail surface
- let `smart_links` own rule config, execution requests, scoring, and provenance modeling
- let `links` consume `smart_links` results and publish the final `SuggestedLink[]`

### D6. Rust should own rule execution for indexed signals

The indexed signals already live in SQLite and the embedding lookup already lives in Rust.

So rule execution should happen in a Rust `smart_links` backend feature that reuses search DB/vector helpers, instead of bouncing multiple primitive queries to TypeScript and merging there.

## Proposed architecture

## Frontend

### New feature: `src/lib/features/smart_links/`

Suggested shape:

```text
src/lib/features/smart_links/
├── index.ts
├── ports.ts
├── state/
│   └── smart_links_store.svelte.ts
├── application/
│   ├── smart_links_service.ts
│   └── smart_links_actions.ts
├── adapters/
│   └── smart_links_tauri_adapter.ts
├── domain/
│   ├── default_rules.ts
│   ├── score_smart_links.ts
│   └── normalize_rule_config.ts
└── types/
    └── smart_link.ts
```

Responsibilities:

- `SmartLinksStore`: current config, load/save state, maybe cached last-computed suggestions keyed by note path
- `SmartLinksService`: load/save config, request suggestions, merge duplicate targets, normalize scoring if needed on the frontend
- `smart_links_actions.ts`: settings actions only
- `SmartLinksPort`: `get_config`, `set_config`, `compute_suggestions`

### Links feature changes

Keep `links` as the owner of the links rail, but extend its result model.

Current store type:

```ts
type SuggestedLink = {
  note: NoteMeta;
  similarity: number;
};
```

Proposed direction:

```ts
type SuggestedLinkReason = {
  rule_id: string;
  label: string;
  score: number;
};

type SuggestedLinkSource = "semantic" | "smart";

type SuggestedLink = {
  note: NoteMeta;
  score: number;
  source: SuggestedLinkSource;
  reasons: SuggestedLinkReason[];
};
```

Notes:

- rename `similarity` to `score` so the rail is not lying once non-semantic rules exist
- keep the current visual badge simple in v1; provenance can appear as a secondary text/badge row
- insertion behavior stays unchanged

### Reactor integration

Keep the existing `suggested_links_refresh` reactor as the trigger point.

Change the invoked flow from:

- `LinksService.load_suggested_links(note_path, limit, threshold)`

To:

- `LinksService.load_suggested_links(note_path)`
  - loads existing rail limit from UI settings
  - delegates smart-link computation to `SmartLinksService`

That preserves the current side-effect topology.

## Backend

### New Rust feature: `src-tauri/src/features/smart_links/`

Suggested shape:

```text
src-tauri/src/features/smart_links/
├── mod.rs
├── model.rs
├── db.rs
└── service.rs
```

Responsibilities:

- `model.rs`: rule/config/result types exposed to Specta/Tauri
- `db.rs`: SQL helpers for metadata rules and graph-style relationship queries
- `service.rs`: command handlers and rule execution orchestration

Reuse from existing search feature:

- `search/db.rs` for note metadata helpers where reasonable
- `search/vector_db.rs` for note embedding KNN
- existing DB connection helpers

## Configuration model

Use a vault-scoped config object keyed in vault settings:

```ts
type SmartLinkConfig = {
  enabled: boolean;
  rules: SmartLinkRule[];
};

type SmartLinkRule = {
  id:
    | "same_day"
    | "same_folder"
    | "shared_property"
    | "shared_tag"
    | "citation_network"
    | "semantic_similarity"
    | "title_overlap"
    | "shared_outlinks"
    | "same_day_and_semantic"
    | "shared_tag_and_semantic"
    | "citation_and_semantic";
  enabled: boolean;
  weight: number;
  limit?: number;
  config?: Record<string, unknown>;
};
```

Keep the model flat in v1.

Do not introduce nested “rule groups” in persistence unless the UI genuinely needs it. Grouping can remain presentational.

## Rule plan

## Phase 1 rules only

Ship the rules that already map cleanly to indexed data and existing APIs:

- `same_day`
- `shared_tag`
- `shared_property`
- `citation_network`
- `semantic_similarity`

Rationale:

- these cover metadata, references, and embeddings
- they give good diversity without over-building the engine
- they avoid premature text-token overlap heuristics and composite orchestration complexity

## Deferred rules

Defer these until the base engine is live and measured:

- `same_folder`
- `title_overlap`
- `shared_outlinks`
- all composite rules

Reason: they are useful, but not required for proving the architecture or UX.

## Execution model

For one source note:

1. Load smart-link config from vault settings
2. Short-circuit if feature disabled
3. Execute each enabled rule independently in Rust
4. Collect candidate hits by `target_path`
5. Merge candidates by target
6. Aggregate score from weighted per-rule contributions
7. Remove:
   - the source note itself
   - already-linked notes if the product keeps that invariant
8. Sort descending by score
9. Truncate to rail limit
10. Return typed suggestions with provenance

### Important invariant

Keep the existing behavior that suggested links should prefer notes not already linked to the current note.

For semantic suggestions this already exists via `exclude_linked: true`. Smart linking should preserve the same invariant across all rules so the rail stays additive instead of noisy.

## SQL/query strategy

### `same_day`

Use the source note’s `mtime_ms` day bucket and fetch peer notes from the same day.

Do not use a full table scan per request; add or reuse an index path if query plans show this is needed.

### `shared_tag`

- load source note tags from `note_inline_tags`
- find other notes sharing one or more tags
- raw score can scale with overlap count and optionally tag rarity later

### `shared_property`

- load source note properties from `note_properties`
- find notes with exact key/value matches
- exclude noisy/system keys if needed via a denylist

### `citation_network`

- use `notes.linked_source_id`
- only match when the source note has a linked source id
- this is effectively “same cited source / same imported reference neighborhood”

### `semantic_similarity`

- reuse note embedding lookup + KNN search
- keep the current exclusion of already-linked notes
- translate `distance` into a bounded rule score in the backend

## Ranking model

Start simple and explicit.

For each returned target:

```text
final_score = sum(rule.weight * rule_score)
```

Where each `rule_score` is normalized to `0..1`.

Initial normalization examples:

- `same_day`: `1.0`
- `citation_network`: `1.0`
- `shared_tag`: overlap-based, capped at `1.0`
- `shared_property`: match-count-based, capped at `1.0`
- `semantic_similarity`: `1 - distance`, floored at `0`

Do not overfit ranking in v1. Provenance matters more than perfect scoring.

## BDD scenarios

These are the core behaviors the implementation should lock down first.

### Scenario 1: semantic suggestions still work when only semantic rule is enabled

- Given smart linking is enabled
- And only `semantic_similarity` is enabled
- When the links rail asks for suggestions
- Then the result is equivalent in spirit to today’s `find_similar_notes()` flow
- And suggestions exclude the source note and already-linked notes

### Scenario 2: metadata suggestions appear without embeddings

- Given the source note has no embedding yet
- And metadata rules are enabled
- When suggestions are requested
- Then metadata-based candidates still appear
- And semantic rule failure does not zero out the whole result set

### Scenario 3: one target can be suggested by multiple rules

- Given note B matches note A on tags and semantic similarity
- When suggestions are requested for note A
- Then note B appears once
- And the suggestion contains both reasons
- And the final score reflects both rule contributions

### Scenario 4: existing explicit links are not re-suggested

- Given note A already links to note B
- When note B also matches enabled smart-link rules
- Then note B is filtered from suggestions

### Scenario 5: config is vault-scoped

- Given two vaults with different smart-link configs
- When each vault opens the same-named note path
- Then each vault uses its own rules and weights

### Scenario 6: stale responses do not overwrite newer note suggestions

- Given the user switches notes while suggestion computation is in flight
- When the earlier request resolves after the later one
- Then the older result is ignored

## Implementation phases

## Phase 0: data model and contract cleanup

### Frontend

- add `smart_links` feature slice and public entrypoint
- add typed smart-link config/result models
- extend `SuggestedLink` to support `score`, `source`, and `reasons`
- update links rail UI to render score and lightweight provenance

### Backend

- add `smart_links` Tauri feature module
- register commands in `src-tauri/src/app/mod.rs`
- add Specta types for config and suggestions

### Exit criteria

- app compiles with new contracts
- no behavioral change yet when feature disabled

## Phase 1: vault-scoped config persistence

### Frontend

- add `SmartLinksPort.get_config()` / `set_config()` via vault settings
- add service methods to load/save config
- define defaults in `default_rules.ts`

### Backend

- persist under vault settings key `smart_links`
- validate/normalize malformed config on read

### Exit criteria

- config survives vault reopen
- missing config cleanly falls back to defaults

## Phase 2: backend rule engine for note-level rules

Implement in Rust:

- `same_day`
- `shared_tag`
- `shared_property`
- `citation_network`
- `semantic_similarity`

Add a single command, e.g.:

```ts
compute_smart_link_suggestions(vault_id, note_path, limit, config)
```

Return merged ranked suggestions with provenance.

### Exit criteria

- suggestions can be computed entirely from backend in one call
- semantic failure degrades gracefully instead of failing the whole request

## Phase 3: links rail integration

- change `LinksService.load_suggested_links()` to call `SmartLinksService`
- preserve stale-request protection semantics
- preserve clear/reset semantics
- keep existing insert-link action unchanged

### Exit criteria

- links rail shows smart-link suggestions end to end
- current UX remains responsive and deterministic

## Phase 4: settings UI

Add a minimal settings surface, likely under vault settings rather than editor appearance settings:

- master toggle
- per-rule enable/disable
- per-rule weight
- semantic threshold for the semantic rule only

Do not build a bases-style query-builder UI in v1.

A compact list of toggles and sliders is enough.

### Exit criteria

- users can turn noisy rules off
- users can bias the ranking without editing JSON

## Phase 5: quality pass and deferred-rule evaluation

Only after v1 is stable:

- measure which rules produce useful results
- decide whether to add `same_folder`, `title_overlap`, `shared_outlinks`
- decide whether composite rules are actually needed or whether weighting already captures enough signal

## Testing plan

## Frontend unit tests

Add/extend tests for:

- `SmartLinksService` config load/save
- `LinksService.load_suggested_links()` integration with smart-links service
- stale request handling
- result mapping into `LinksStore`
- UI rendering of multi-reason suggestions

## Backend tests

Add Rust tests for:

- each rule query in isolation
- merge/dedup behavior
- weighted score aggregation
- exclusion of source note and already-linked notes
- config normalization/defaulting

## Integration tests

Use controlled vault fixtures to verify:

- metadata-only suggestions work without embeddings
- semantic + metadata merge works
- per-vault config changes results

## Performance guardrails

The smart-link request path is on-note-open / on-links-rail-open, so it must stay cheap.

Guardrails:

- one backend command per request
- no per-candidate round-trips to the frontend
- avoid N+1 metadata loading
- over-fetch semantic results only as much as needed to survive filtering
- add indexes only when query plans justify them

If needed later, add a short-lived per-session cache keyed by `(vault_id, note_path, config_hash)` in the frontend service or backend command layer.

That is an optimization, not MVP scope.

## Non-goals

- block-level notes
- block embeddings
- block-level smart-link suggestions
- graph rendering for smart links
- a bases-like visual rule composer
- a new standalone on-disk `rules.json` format

## File impact map

### New frontend files

- `src/lib/features/smart_links/index.ts`
- `src/lib/features/smart_links/ports.ts`
- `src/lib/features/smart_links/state/smart_links_store.svelte.ts`
- `src/lib/features/smart_links/application/smart_links_service.ts`
- `src/lib/features/smart_links/application/smart_links_actions.ts`
- `src/lib/features/smart_links/adapters/smart_links_tauri_adapter.ts`
- `src/lib/features/smart_links/domain/default_rules.ts`
- `src/lib/features/smart_links/domain/normalize_rule_config.ts`
- `src/lib/features/smart_links/types/smart_link.ts`

### Existing frontend files likely touched

- `src/lib/features/links/application/links_service.ts`
- `src/lib/features/links/state/links_store.svelte.ts`
- `src/lib/features/links/ui/suggested_links_section.svelte`
- `src/lib/reactors/suggested_links_refresh.reactor.svelte.ts`
- `src/lib/app/di/create_app_context.ts`
- `src/lib/app/...` action registration wiring

### New backend files

- `src-tauri/src/features/smart_links/mod.rs`
- `src-tauri/src/features/smart_links/model.rs`
- `src-tauri/src/features/smart_links/db.rs`
- `src-tauri/src/features/smart_links/service.rs`

### Existing backend files likely touched

- `src-tauri/src/app/mod.rs`
- `src-tauri/src/features/search/db.rs` or shared helpers reused from it
- `src-tauri/src/features/search/vector_db.rs` reuse only, not redesign
- vault settings plumbing only if typed helpers are added

## Recommended rollout

1. land contracts + config persistence
2. land metadata rules
3. land semantic rule integration
4. wire links rail
5. add minimal settings UI
6. measure before adding more rules

## Final recommendation

Do not treat smart linking as a thin extension of the current semantic-suggestions code.

Treat it as a small but real feature slice:

- vault-scoped config
- backend-owned rule execution
- note-level ranked suggestions with provenance
- links-rail integration

That is the simplest design that fits the current Carbide architecture, delivers user-visible value quickly, and keeps block-level work where it belongs: outside the MVP.
