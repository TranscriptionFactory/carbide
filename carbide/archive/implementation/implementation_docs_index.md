# Archived implementation docs — index

> **This is history, not a roadmap.** These docs describe the 2026-03 → 2026-05
> implementation push. The phases below have shipped; the docs are retained for
> rationale and archaeology. For current work see `carbide/TODO.md`,
> `carbide/plans/`, and `docs/architecture.md`.
>
> Reorganized 2026-08-09: 181 previously-flat files are now bucketed by month
> (from the filename date, or first-commit date where the filename had none).

## Layout

| Dir | Files | Period |
|---|---|---|
| `2026-03/` | 69 | Early bug batches, editor core, IWE/LSP, markdown syntax, indexing |
| `2026-04/` | 97 | Phase 1–6 roadmap, plugin host, AI integration, metadata/bases |
| `2026-05/` | 15 | Late fixes and reviews |
| `heading-suggest/`, `mdit-port-review/` | 1 each | Focused sub-investigations |

## The roadmap packet

The ten docs below were the core delivery packet. `execution_security_and_readiness.md`
carried the cross-cutting rules; the `phaseN_*` docs were read in order.

| Document | Scope | Main output |
|---|---|---|
| `2026-04/execution_security_and_readiness.md` | Cross-cutting trust boundaries, architecture gates, readiness checklist | Shared implementation rules and stop-conditions |
| `2026-04/phase1_terminal_and_document_performance.md` | Terminal hardening plus big-file viewer work | Phase 1 delivery plan for terminal and document slices |
| `2026-04/phase1_visual_customization.md` | Typed customization over theme and settings systems | Plan for typography, spacing, selection, editor appearance |
| `2026-04/phase2_graph_mvp.md` | Native graph slice over link and index foundations | Graph MVP architecture, data flow, milestones |
| `2026-04/phase3_metadata_and_bases.md` | Metadata index plus Bases foundations | Shared model for frontmatter, properties, queries, view types |
| `2026-04/phase4_tasks_and_views.md` | Task domain, Kanban, schedule view, command-tool boundaries | Plan for tasks as a real domain rather than isolated UI |
| `2026-04/phase5_plugin_host_implementation.md` | Secure native plugin host | Phase-by-phase plugin plan over host-owned APIs |
| `2026-04/phase6_canvas.md` | Native canvas (Excalidraw & JSON Canvas) | Plan for spatial note board and drawing |
| `2026-04/ai_integration_implementation.md` | AI assistant redesign and pipeline backend | Plan and progress log for the unified AI assistant |
| `2026-03/2026-03-21_ast_aware_embeddings_plan.md` | AST-informed embedding projection, section-level retrieval | Staged plan for note vectors, section vectors, result collapse |

The other ~170 files in these folders are bug batches, fix logs, audits, and
one-off investigations from the same period. They were never indexed and are
best found by filename or `grep`.

## Reading these safely

- **Cross-references are stale.** These docs cite paths like
  `carbide/implementation/…` and `carbide/research/…` from before the archive
  move. Most now live under `carbide/archive/`. Resolve by filename, not path.
- **Pre-rebrand naming.** Docs refer to donor projects (Badgerly as the base,
  Lokus and Ferrite as donors) and to files that no longer exist
  (`unified_ferrite_lokus_roadmap.md`, `lokus_portability_reassessment.md`).
  That framing is obsolete — Carbide is its own codebase.
- Treat everything here as a record of intent at the time, not as an API
  guarantee or a current stance.
