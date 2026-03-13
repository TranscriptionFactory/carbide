# Phase 1 Implementation: Visual Customization

This document turns the roadmap's "deep visual customization" goal into an implementation plan that fits Otterly's current settings, theme, and reactor architecture.

## Goal

Ship visible customization wins early without recreating Lokus's global singleton settings model.

## Donor references from Lokus

Use these as donor references for breadth and grouping only:

- `src/core/editor/live-settings.js`
- `src/views/Preferences.jsx`

Do not copy:

- global singleton mutation model
- broad untyped CSS mutation from arbitrary places

## Current Carbide seams

### Existing theme and settings files

- `src/lib/features/settings/domain/settings_catalog.ts`
- `src/lib/features/settings/application/settings_service.ts`
- `src/lib/features/settings/ui/settings_dialog.svelte`
- `src/lib/features/settings/ui/theme_settings.svelte`
- `src/lib/features/theme/application/theme_service.ts`
- `src/lib/shared/utils/apply_theme.ts`
- `src/lib/reactors/editor_width.reactor.svelte.ts`
- `src/lib/shared/types/theme.ts`
- `src/lib/shared/types/editor_settings.ts`

### Existing strengths

- typed theme model already exists
- typed editor settings already exist
- theme application already flows through `apply_theme`
- editor width already demonstrates the correct "setting -> reactor -> DOM application" pattern

## Design split

Do not lump all appearance controls into one blob.

### Theme slice owns

Stable theme tokens and persisted theme definitions, including:

- color scheme
- base color tokens
- editor font size and line height if they are truly theme-level
- any setting that should travel with a named theme

### Settings slice owns

User-facing appearance preferences that are not part of theme identity, including:

- editor max width
- optional typography overrides
- spacing density
- selection styling
- code-block presentation toggles
- behavior or presentation flags that are not theme assets themselves

### Reactors own DOM application

Any live application of appearance settings to the document should happen through host-owned utilities plus reactors, not arbitrary component-side mutation.

## Proposed implementation shape

### 1. Expand typed settings surface first

Primary files:

- `src/lib/shared/types/editor_settings.ts`
- `src/lib/features/settings/domain/settings_catalog.ts`
- `src/lib/features/settings/application/settings_service.ts`

Add only settings with clear ownership and obvious user value.

Recommended first batch:

- paragraph spacing density
- list spacing density
- selection color override
- code block padding and radius
- blockquote border width and padding
- link underline style
- optional letter spacing and font weight controls only if they read well in practice

### 2. Add host-owned application utilities

Instead of mutating random CSS variables from the settings dialog, create or extend focused helpers such as:

- `apply_editor_appearance.ts`
- `apply_selection_tokens.ts`
- `apply_code_block_tokens.ts`

These should be pure host utilities, similar to `apply_theme` and `apply_editor_width`.

### 3. Mount new reactors

Follow the existing width pattern.

Potential files:

- `src/lib/reactors/editor_appearance.reactor.svelte.ts`
- `src/lib/reactors/selection_style.reactor.svelte.ts`

If multiple appearance concerns can be applied through one stable reactor, prefer one reactor over many tiny ones. Do not create reactor spam.

### 4. Keep dialogs and controls declarative

UI files should remain thin:

- `settings_dialog.svelte`
- `theme_settings.svelte`

These should edit typed values, not own application logic.

## Decisions to keep explicit

- vault versus global scope for each setting
- which controls belong to themes versus raw editor settings
- which overrides are allowed simultaneously
- whether per-theme overrides are merged or replaced

If scope is ambiguous, do not ship the setting yet.

## Recommended rollout

### Milestone 1: Highest-value readability controls

- selection color
- paragraph and list spacing
- code block presentation
- blockquote presentation
- link underline style

### Milestone 2: Typography expansion

- letter spacing
- font weight variants
- heading scale options
- additional editor width or reading-density controls if still needed

### Milestone 3: Theme-aware polish

- ensure all new appearance variables respect light and dark theme switching
- confirm theme export/import remains coherent if any new fields are theme-owned

## Tests

- typed settings serialization and defaults
- settings catalog coverage for new keys
- reactor tests ensuring CSS variables update when values change
- visual smoke tests for theme switch and settings reset flows
- regression tests preventing global and vault scope mix-ups

## Definition of done

This phase is done when:

- the most visible readability controls are typed and persisted
- live changes apply through host-owned utilities and reactors
- new controls fit existing settings and theme boundaries
- no component owns ad hoc CSS mutation logic that should live in the host layer
