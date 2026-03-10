# AI Integration Implementation Plan

## Goal

Redesign Otterly's AI integration so it feels like one assistant rather than three branded provider entrypoints, while preserving explicit apply boundaries, local CLI execution, vault safety checks, and clear user control.

## Product decisions

- The primary feature is **AI Assistant**
- Claude, Codex, and Ollama remain supported as backends, not first-class product surfaces
- AI must have a clear **Enable AI** setting
- Disabling AI must hide or block user-facing AI entrypoints and prevent CLI execution
- AI output remains draft-only until the user explicitly applies it

## Invariants

- No direct AI writes to note content without explicit user apply
- No note path outside the vault is ever executed against
- AI execution remains behind the existing adapter and Tauri command boundary
- Provider-specific configuration stays in settings, but provider branding is de-emphasized in the main UX

## Phases

### Phase 1 — Foundation

- Add `ai_enabled` global setting
- Replace provider-first command palette entries with a single `AI Assistant` command
- Add a single `ai.open_assistant` action
- Keep provider-specific actions only as internal compatibility wrappers
- Add backend selection inside the AI dialog
- Gate AI actions and command visibility behind `ai_enabled`

### Phase 2 — Better current dialog

- Keep prompt visible after runs instead of hard-swapping to a raw result-only flow
- Add a clearer backend selector and context summary
- Make the current experience feel like one assistant with multiple backends

### Phase 3 — Assistant panel

- Move from modal dialog to persistent assistant panel
- Add conversation history
- Keep draft/result review separate from apply

### Phase 4 — Diff-first review

- Show proposed edits as diff instead of only raw output
- Support refined follow-up turns without losing context

## Initial implementation scope for this branch

1. Add `ai_enabled` setting and settings UI toggle
2. Add a single `AI Assistant` command/action surface
3. Add backend selection inside the existing AI dialog
4. Hide AI command palette entry when AI is disabled
5. Add focused tests for settings persistence and command filtering

## Progress log

### 2026-03-10

- Reviewed current AI implementation across frontend store/actions/UI and Rust execution boundary
- Confirmed current pain points: provider-first entrypoints, one-shot modal flow, no conversational loop, and weak trust UX around raw output review
- Began Phase 1 foundation work on branch `feat-ai-assistant-foundation`
- Added global `ai_enabled` setting and surfaced it as the first AI settings toggle
- Disabled AI now hides the unified AI command from command search and blocks AI action execution with an explicit settings-driven guard
- Replaced provider-first command palette entries with a single `AI Assistant` command/action surface
- Added backend selection inside the current AI dialog so provider choice is secondary instead of the main entrypoint
- Added tests for AI action gating, command filtering, and settings persistence
- Validation:
  - `pnpm check` ✅
  - `pnpm lint` ✅
  - `pnpm test` ✅
  - `cargo check` ✅
  - `pnpm format` ✅
- Continued Phase 2 with a more stable assistant surface:
  - the prompt/composer now stays visible after generating a draft
  - generated output is shown inline instead of replacing the entire dialog state
  - scope is now an explicit assistant control with `Selection` and `Full Note`
  - re-running the assistant after a result now behaves like a draft refinement pass
- Added in-session assistant history as the bridge to a fuller conversational assistant:
  - each run is now recorded as a session turn with provider, scope, prompt, and result
  - repeated runs now read as one evolving interaction instead of unrelated one-shot edits
  - the latest draft still remains explicit and apply-gated
- Added diff-first draft review before apply:
  - successful AI drafts now show a line-based diff against the original selection or note
  - additions/deletions are surfaced before apply so the draft reads as a proposal, not opaque replacement text
  - raw draft output is still visible below the diff for exact inspection
- Additional validation after the Phase 2 slice:
  - `pnpm check` ✅
  - `pnpm lint` ✅
  - `pnpm test` ✅
  - `cargo check` ✅
  - `pnpm format` ✅
- Began Phase 3 by moving the assistant into the existing right-side context rail instead of keeping it as a blocking modal:
  - added an `AI` tab to the context rail so the assistant lives beside Links and Outline
  - rewired `ai.open_assistant` to seed/open the rail instead of mounting a dialog
  - closing the rail now preserves the current AI session, prompt, history, and latest draft
  - explicit session reset still clears AI state and closes the rail
- Refactored the assistant UI into a reusable surface so dialog/panel shells do not duplicate the draft-review logic:
  - extracted shared assistant content into `ai_assistant_content.svelte`
  - introduced `ai_assistant_panel.svelte` for the persistent rail-hosted assistant
  - removed the modal mounting from `app_shell_dialogs.svelte`
- Added tests for the panel-oriented flow:
  - opening the assistant now asserts the context rail opens on the `ai` tab
  - reopening the rail preserves the in-progress session instead of resetting it
  - resetting the assistant clears session state and closes the panel
- Added partial-apply controls on top of the diff-first review:
  - split AI diffs into separate hunks when edits are far apart
  - let users select which change groups to apply
  - generate a partial draft preview from the selected hunks before apply
  - route partial apply through the same explicit editor apply boundary
- Added focused tests for:
  - diff hunk splitting and partial draft reconstruction
  - applying an AI result override through the assistant action path
- Added sent-context transparency in the assistant surface:
  - the assistant now shows the exact note path/title, scope, line count, and character count that will be sent
  - users can expand a payload preview to inspect the exact source text before running the assistant
  - selection mode still keeps a compact inline preview when the payload drawer is collapsed
- Added a pure context-preview helper with unit tests so the trust metadata stays deterministic and easy to evolve

## Open follow-ups

- Consider a default backend setting or auto-selection strategy after the persistent assistant flow is stable
- Consider a structured edit proposal contract once the panel UX is settled
- Consider preserving hunk selections across panel hide/show cycles if users need longer review sessions
