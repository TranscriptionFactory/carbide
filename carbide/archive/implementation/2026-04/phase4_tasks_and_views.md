# Phase 4 Implementation: Tasks and Workflow Views

This document defines the task domain, Kanban, scheduling views, and the boundary between workflow tooling and command execution.

## Goal

Treat tasks, boards, and schedule views as first-class views over a real task and metadata model.

## Donor stance from Lokus

Good donors:

- task capture UX
- task mention and board selection UX
- Kanban ergonomics

Bad donors:

- workspace boot flows like `initialize_workspace_kanban`
- calendar auth and sync stack
- implicit workspace-global board discovery

## Core decisions

### 1. Tasks remain grounded in Markdown

Tasks are derived from Markdown, not duplicated into a proprietary store.

This means:

- Markdown remains the editable source of truth
- task indexes are derived and cached
- task state changes that change task content must round-trip back to Markdown safely

### 2. Task indexing extends the metadata pipeline

Task extraction should piggyback on the metadata and search indexing lifecycle.

Recommended split:

- task extraction during indexing extends the metadata path
- task-specific query and mutation commands live in a dedicated `tasks` backend feature

### 3. Kanban and schedule views are task views, not their own domain

Kanban and schedule views should be fed by the task model and metadata filters.

They should not become parallel models with their own boot logic.

## Backend plan

### Indexing

Extend metadata indexing to extract:

- task text
- checkbox state
- source note path
- block or line identity needed for safe updates
- due date or status if encoded in supported task syntax
- heading or section context if useful

### Feature surface

Add:

- `src-tauri/src/features/tasks/mod.rs`
- `src-tauri/src/features/tasks/service.rs`
- `src-tauri/src/features/tasks/types.rs`

Suggested operations:

- query tasks
- update task completion state
- move task between supported states
- return groupings for Kanban or scheduling views

Mutations must remain Markdown-safe.

## Frontend plan

Create a dedicated task slice:

- `src/lib/features/task/ports.ts`
- `src/lib/features/task/state/task_store.svelte.ts`
- `src/lib/features/task/application/task_service.ts`
- `src/lib/features/task/application/task_actions.ts`
- `src/lib/features/task/adapters/task_tauri_adapter.ts`
- `src/lib/features/task/ui/task_panel.svelte`
- `src/lib/features/task/ui/kanban_view.svelte`
- `src/lib/features/task/ui/schedule_view.svelte`
- `src/lib/features/task/index.ts`

## State ownership

`TaskStore` should own:

- current task query
- current grouping mode
- task result set
- board or schedule selection state
- loading and mutation status

Do not put workflow state into generic view stores or editor stores.

## UX rollout

### Milestone 1: Task extraction and task list

- query extracted tasks
- filter by status and note
- open source note from a task result

### Milestone 2: Fast task capture

- add task capture affordances informed by Lokus UX
- keep capture integrated with the Carbide editor model
- only support syntax that round-trips cleanly to Markdown

### Milestone 3: Kanban view

- build column groupings from task status or configured property
- moving a task updates the underlying Markdown safely
- keep board generation driven by task queries, not separate board boot logic

### Milestone 4: Schedule view

- add a simple internal scheduling view over due-date style fields
- do not add external calendar sync here

## Command tooling boundary

The current pipeline backend remains a separate system.

Rules:

- tasks and workflow views do not depend on arbitrary shell execution
- plugins do not inherit command or pipeline power
- any future command-tool UI should stay app-owned and explicit

## Tests

- task extraction tests from representative Markdown
- task mutation round-trip tests
- Kanban grouping and move tests
- schedule view query tests
- integration tests ensuring task updates do not corrupt source notes

## Definition of done

This phase is done when:

- tasks are indexed as a real domain over Markdown
- Kanban and schedule views are derived from that domain
- workflow views do not depend on workspace-global boot logic
- command execution remains separate from workflow and plugin capabilities
