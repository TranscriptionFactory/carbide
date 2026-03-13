# Carbide Implementation Documentation Index

This index is the implementation packet for the current Carbide roadmap. Read it as a companion to:

- `carbide/implementation/unified_ferrite_lokus_roadmap.md`
- `carbide/research/lokus_portability_reassessment.md`
- `carbide/plugin_system.md`
- `docs/architecture.md`

## How to use this packet

1. Read the unified roadmap for delivery order.
2. Read the portability reassessment before borrowing anything from Lokus.
3. Read `execution_security_and_readiness.md` before starting any new implementation workstream.
4. Read the phase-specific implementation doc for the work you are about to build.
5. Treat these docs as implementation guides, not as permanent API guarantees. Clean internal breaks are allowed if they simplify the system and preserve the documented intent.

## Implementation docs

| Document                                      | Scope                                                                   | Read when                                                            | Main output                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `execution_security_and_readiness.md`         | Cross-cutting trust boundaries, architecture gates, readiness checklist | Before starting any new roadmap phase                                | Shared implementation rules and stop-conditions                              |
| `phase1_terminal_and_document_performance.md` | Terminal hardening plus big-file viewer work                            | Improving terminal behavior or large document handling               | Concrete phase 1 delivery plan for the existing terminal and document slices |
| `phase1_visual_customization.md`              | Typed customization expansion over current theme and settings systems   | Adding typography, spacing, selection, or editor appearance controls | Implementation plan for high-value visible customization                     |
| `phase2_graph_mvp.md`                         | Native graph slice over existing link and index foundations             | Starting graph work                                                  | Graph MVP architecture, data flow, and milestones                            |
| `phase3_metadata_and_bases.md`                | Metadata index plus Bases foundations                                   | Starting metadata extraction or Bases work                           | Shared model for frontmatter, properties, queries, and early view types      |
| `phase4_tasks_and_views.md`                   | Task domain, Kanban, schedule view, and command-tool boundaries         | Starting task extraction or workflow views                           | Implementation plan for tasks as a real domain, not isolated UI              |
| `phase5_plugin_host_implementation.md`        | Secure native plugin host                                               | Starting plugin work                                                 | Phase-by-phase plugin implementation plan over host-owned APIs               |
| `phase6_canvas.md`                           | Native canvas feature (Excalidraw & JSON Canvas)                        | Starting canvas or whiteboard work                                   | Implementation plan for spatial note board and drawing feature               |

## Recommended reading order

### Start here

1. `execution_security_and_readiness.md`
2. `phase1_terminal_and_document_performance.md`
3. `phase1_visual_customization.md`

### Then move into net-new slices

4. `phase2_graph_mvp.md`
5. `phase3_metadata_and_bases.md`
6. `phase4_tasks_and_views.md`
7. `phase5_plugin_host_implementation.md`
8. `phase6_canvas.md`

## Current implementation stance

- Otterly remains the base.
- Lokus remains a donor.
- Ferrite remains a performance and safety donor.
- Plugins, terminal sessions, and command execution remain separate security domains.
- Markdown and vault compatibility guardrails remain in force.

## When this packet should be updated

Update this packet when any of the following change:

- the unified roadmap changes delivery order
- a new implementation doc becomes the source of truth for a workstream
- an earlier decision about Lokus donor value changes
- a phase lands and the remaining implementation plan materially changes
