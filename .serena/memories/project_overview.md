# Otterly Project Overview

## Purpose

Otterly is a Tauri desktop note-taking app with markdown support, vault management, and git integration.

## Tech Stack

- **Frontend**: SvelteKit (Svelte 5 with runes), TypeScript, Tailwind CSS
- **UI Components**: shadcn-svelte (bits-ui primitives)
- **Backend**: Tauri (Rust)
- **Testing**: Vitest
- **Linting**: oxlint + custom layering rules
- **Formatting**: Prettier
- **Package Manager**: pnpm

## Key Architecture

- Feature-based folder structure: `src/lib/features/<feature>/`
- Each feature has: `domain/`, `application/`, `state/`, `ui/`, `adapters/`, `ports.ts`, `index.ts` (barrel)
- Action registry pattern: `ACTION_IDS` → actions registered in `*_actions.ts` → hotkeys in `default_hotkeys.ts`
- Stores use Svelte 5 `$state` runes (class-based stores)
- Branded types for IDs: `VaultId`, `VaultPath`, `NotePath`
- BEM-style CSS class naming (e.g., `VaultPanel__vault-item--active`)

## Commands

- `pnpm check` — Svelte/TS type checking
- `pnpm lint` — oxlint + layering rules
- `pnpm test` — Vitest
- `pnpm format` — Prettier
- `cd src-tauri && cargo check` — Rust type checking

## Conventions

- Snake case for file names
- No comments/docstrings unless non-obvious
- Tests in top-level `tests/` directory
- shadcn-svelte components in `src/lib/components/ui/`
- bits-ui uses `child` snippet pattern (NOT `asChild` prop)
- ContextMenu.Item uses `onSelect` (NOT `onclick`)
- shadcn components use `$lib/shared/utils/component_utils.js` path
