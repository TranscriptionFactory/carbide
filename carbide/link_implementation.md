# Link implementation plan

## Goals

- make Markdown links portable and standards-aligned
- keep authoring simple for nested folders
- preserve Otterly conveniences where they do not corrupt Markdown semantics
- stage the rollout so we can ship improvements without a risky one-shot rewrite

## Product rules

### Markdown links

- `[label](foo.md)` resolves relative to the current note
- `[label](sub/foo.md)` resolves relative to the current note
- `[label](../foo.md)` resolves relative to the current note
- `[label](/docs/foo.md)` resolves from vault root
- fragments and queries are preserved semantically, even if heading navigation is deferred
- local non-note files remain valid Markdown links and should not become dead clicks

### Wikilinks

- `[[Foo]]`, `[[folder/Foo]]`, `[[Foo|Label]]` remain Otterly-native note references
- wikilink resolution remains app-defined
- markdown-link behavior must not be overloaded with wikilink semantics

## Constraints in the current code

- link resolution is centralized in `src-tauri/src/features/search/link_parser.rs`
- Markdown links and wikilinks currently share the same resolver in multiple paths
- editor click handling currently forwards only `href` and `base_note_path`, so rendered links do not yet carry explicit source-syntax metadata
- local non-`.md` links are currently filtered out by the editor click plugin

## Rollout plan

### Phase 1: standard Markdown note resolution

Status: in progress

- add a dedicated Markdown resolver in Rust
- keep wikilink resolution logic separate in Rust
- update Markdown link indexing and rewrite logic to use Markdown semantics
- change note-opening resolution used by editor link clicks to use Markdown semantics
- add regression tests for:
  - sibling Markdown links
  - nested Markdown links
  - explicit root-relative Markdown links
  - source-move rewrites for relative Markdown links
  - root-relative Markdown links remaining stable on source move

Scope note:

- because editor click events currently do not distinguish whether a rendered `<a>` came from source Markdown or a typed wikilink, link-click resolution will temporarily follow Markdown semantics for all rendered note links
- that is acceptable as a first corrective step because it fixes portability and README/index behavior immediately

### Phase 2: explicit rendered-link kinds

- carry link-kind metadata through the editor layer so rendered anchors can distinguish:
  - Markdown note links
  - wikilinks
  - local file links
  - external URLs
- route clicks through a typed resolver instead of a single note resolver
- preserve fragments through the click pipeline

Likely touch points:

- `src/lib/features/editor/adapters/wiki_link_plugin.ts`
- `src/lib/features/editor/adapters/milkdown_adapter.ts`
- editor link mark schema/config
- search/document open actions

### Phase 3: local file link handling

Status: in progress

- stop dead-clicking local non-note links
- route local files to:
  - document viewer when supported
  - system/default app otherwise
- preserve raw Markdown-link fragments/queries through click handling so supported viewers can opt into them
- add tests for PDFs and other local assets

### Phase 4: authoring UX

- default insert-link command inserts Markdown links
- link picker inserts shortest portable relative path
- add explicit “insert wikilink” action
- show path preview before insert
- optionally offer folder `README.md` / `index.md` targets in picker results without adding hidden resolution rules

### Phase 5: migration support

- detect ambiguous legacy Markdown links that were authored under vault-root semantics
- offer migration to explicit root-relative Markdown paths
- keep migration opt-in and inspectable

## Implementation order

1. Rust resolver split
2. Rust rewrite/indexing updates
3. Rust tests
4. frontend test adapter alignment
5. typed editor-link pipeline
6. local file click behavior
7. link picker UX
8. migration tooling

## Immediate implementation in this change

- Phase 1 shipped
- Phase 2 shipped
- Phase 3 started:
  - rendered Markdown links now allow local file targets
  - supported local files open in the document viewer
  - unsupported local files open via the system default app
  - PDF page fragments and queries are preserved through the click path and initialize the viewer page
- no migration assistant yet
