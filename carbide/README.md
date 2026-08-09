# carbide/ — product & design docs

Product-facing planning, design, and research for Carbide. Engineering
documentation lives in `docs/` (see `docs/architecture.md` for the decision tree
that governs all feature work).

Reorganized 2026-08-09: finished work moved to `archive/`, live work foregrounded.

## Start here

| Doc | What it is |
|---|---|
| `TODO.md` | **The live backlog.** Remaining work, open decisions, deferred items. |
| `feature_opportunity_assay.md` | Strategic assay — tiered feature opportunities and rationale. |
| `release_publishing.md` | Release/publishing setup reference. |

## Directories

| Dir | Contents |
|---|---|
| `design/` | Live design docs and specs — timeline layout, UI redesign concepts, sync architecture, programmable actions. |
| `plans/` | **Plans not yet finished.** Anything with remaining work. Finished plans move to `archive/completed_plans/`. |
| `research/` | Investigations, reviews, and comparisons. Completed analyses that inform decisions but aren't themselves plans. |
| `implementation/` | Active implementation references cited by `TODO.md`. |
| `designFiles/` | Mockup assets (HTML/JSX prototypes, handoff files). |
| `templates/` | Prompt templates. |
| `archive/` | Finished, superseded, and historical. See below. |

## What's live

**`plans/` — 14 plans with remaining work.** Notable open state:

- `2026-07-03_inbox-view-left-rail-plan.md` — planning complete, awaiting go-ahead
- `2026-07-21_webview_clip_capture_plan.md` — phases 1–3 shipped, phase 4 (Windows/Linux evaluate-JS) pending
- `task_query_and_embedding_improvements.md` — phases 1–3 done, phase 4 (saved views & polish) pending
- `visual_features_roadmap.md` — phases 1–4 substantially complete; kanban drag-and-drop, gallery image extraction, lazy rendering remain
- `2026-05-29_html_doc_parity_plan.md` — tier 1 planned; tiers 2–3 deferred
- `encryption_plan.md` — matches the "Encryption (Revisit)" item in `TODO.md`; architectural spike needed before implementation

**`research/lsp/`** groups six previously-scattered LSP docs and carries a status
index; it records one open correctness bug (a `didChange`/completion debounce
race) that has no plan yet.

## Archive layout

| Path | Contents |
|---|---|
| `archive/completed_plans/` | Plans whose work shipped, including the AI surface unification and vault RAG chat plans. |
| `archive/implementation/` | The 2026-03 → 2026-05 implementation push, bucketed by month. Has its own index. |
| `archive/research/` | Superseded research, plus `lsp/` holding two corrupted non-markdown dumps. |
| `archive/design/` | Design docs superseded by merges. |
| `archive/scratch/` | Scratch notes. |

**Reading archived docs:** cross-references inside `archive/` are largely stale —
they cite `carbide/implementation/…` and similar paths from before the archive
move. Resolve by filename rather than path. Older docs also use pre-rebrand
framing (Badgerly as base, Lokus/Ferrite as donors) that no longer reflects the
project; `archive/carbide-project-guide.md` is fork-era strategy and is history,
not guidance.
