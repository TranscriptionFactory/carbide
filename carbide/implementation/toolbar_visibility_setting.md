# Configurable Formatting Toolbar Visibility

## Context

The formatting toolbar (commit 7a564245) currently appears as a floating bubble only when text is selected. We want to make visibility configurable with three modes: **on_select** (current), **always_show** (sticky at top of editor), and **always_hide** (never shown). This is an app-wide setting.

Branch: `feat/toolbar-visibility-setting`

## Approach

Use the **mutable config ref** pattern (matching `wiki_link_extension`) — the prosemirror_adapter creates a config object, passes it to the toolbar extension factory, and exposes a `set_toolbar_visibility` method on the session. A reactor syncs the setting from the UI store to the session.

## Progress

### All Done

1. **Setting definition** (`src/lib/shared/types/editor_settings.ts`)
   - Added `ToolbarVisibility` type, `editor_toolbar_visibility` property + default, `GLOBAL_ONLY_SETTING_KEYS` entry, `EDITOR_TOOLBAR_VISIBILITY_OPTIONS` constant

2. **Settings catalog** (`src/lib/features/settings/domain/settings_catalog.ts`)
   - Added `SettingDefinition` for `editor_toolbar_visibility` in `layout` category

3. **Settings dialog** (`src/lib/features/settings/ui/settings_dialog.svelte`)
   - Added Select dropdown in Layout section (near Outline Position), imported `ToolbarVisibility` type and options constant

4. **Toolbar extension** (`src/lib/features/editor/extensions/toolbar_extension.ts`)
   - Accepts `ToolbarConfig` param (with default `{ toolbar_visibility: "on_select" }` for backward compat), passes to prose plugin, adds `mount_sticky(view)` / `unmount_sticky()` callbacks

5. **Formatting toolbar plugin** (`src/lib/features/editor/adapters/formatting_toolbar_plugin.ts`)
   - Accepts `config: ToolbarConfig`, tracks `prev_mode` for transitions
   - `always_hide`: tears down everything, returns early
   - `always_show`: calls `on_sticky_mount(view)` once, no selection logic
   - `on_select`: existing floating behavior unchanged

6. **Extension assembly** (`src/lib/features/editor/extensions/index.ts`)
   - `assemble_extensions` now accepts `toolbar_config: ToolbarConfig` as second param
   - Passes config to `create_toolbar_extension(toolbar_config)`
   - Exports `ToolbarConfig` type

7. **ProseMirror adapter** (`src/lib/features/editor/adapters/prosemirror_adapter.ts`)
   - Creates `toolbar_config` ref before `assemble_extensions()`
   - Passes to `assemble_extensions(ctx, toolbar_config)`
   - Added `set_toolbar_visibility(mode)` to session handle that mutates `toolbar_config.toolbar_visibility`

8. **EditorSession port** (`src/lib/features/editor/ports.ts`)
   - Added: `set_toolbar_visibility?: (mode: ToolbarVisibility) => void`

9. **Editor service** (`src/lib/features/editor/application/editor_service.ts`)
   - Added method: `set_toolbar_visibility(mode) { this.session?.set_toolbar_visibility?.(mode) }`

10. **Reactor** (`src/lib/reactors/editor_appearance.reactor.svelte.ts`)
    - Extended existing reactor with `$effect` that calls `editor_service.set_toolbar_visibility(ui_store.editor_settings.editor_toolbar_visibility)`

11. **Sticky toolbar CSS** (`src/lib/features/editor/ui/formatting_toolbar.svelte`)
    - Added `:global(.formatting-toolbar-mount--sticky) .FormattingToolbar` styles:
      - `border-radius: 0`, `box-shadow: none`, no top/left/right border
      - `border-bottom: 1px solid var(--border)`, `justify-content: center`

12. **Verification** — `pnpm check` (0 errors), `pnpm test` (2687 passing), `pnpm format` (all unchanged)

## Test Fixes

- Fixed 19 `pnpm check` errors from commit `ada89d0a` — added `reference: new ReferenceStore()` to `stores` and `reference: {}` to `services` in 7 test files that construct `ActionRegistrationInput` mocks
- Fixed pre-existing test bug in `register_ui_actions.test.ts` — "closes the graph when toggling the context rail" test was missing `await registry.execute(ACTION_IDS.ui_toggle_context_rail)` call

## Key Design Decisions

- **No new reactor file** — extend `editor_appearance` reactor since it already handles editor visual settings
- **No PluginContext change** — config ref created in adapter, passed directly to extension factory
- **No AssembledExtensions type change** — adapter holds the config ref, not the assembled result
- **Default config for backward compat** — `create_toolbar_extension()` defaults to `{ toolbar_visibility: "on_select" }` so tests that don't pass config still work
- **Sticky toolbar position**: first child of `view.dom.parentElement` (the editor content div), `position: sticky; top: 0; z-index: 10`
- The Svelte component (`formatting_toolbar.svelte`) is unchanged except for global sticky CSS — it already tracks active marks at cursor position
