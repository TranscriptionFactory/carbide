# Plugin Hardening Merge Plan

## Goal

Merge the parts of `origin/feat/plugin-hardening` that improve plugin safety and authoring ergonomics without introducing avoidable API churn or merging unrelated branch drift.

## Source branch

- Remote branch: `origin/feat/plugin-hardening`
- Relevant commits:
  - `1f04cd0b` — activation events + lazy loading
  - `0b4817a3` — lifecycle hooks, RPC timeouts, rate limiting, error budget
  - `b8edde58` — richer settings schema

## Current baseline in `main`-line code

- Plugin host already supports discovery, permission-gated RPC, lifecycle load/unload, hot reload, settings persistence, metadata RPC, diagnostics RPC, and contribution surfaces.
- Current lifecycle contract is still the documented and shipped message shape:
  - host sends `method: "lifecycle.activate"` / `method: "lifecycle.deactivate"`
  - SDK listens for those messages in `src-tauri/src/features/plugin/sdk/carbide_plugin_api.js`
  - docs describe the same contract in `docs/plugin_howto.md`
- Current activation events in `src/lib/features/plugin/ports.ts` are:
  - `on_startup`
  - `on_command:${string}`
  - `on_file_open:${string}`
  - `on_settings_open`
- Current error handling already warns / auto-disables on bursty failures, but does not have:
  - RPC timeouts
  - RPC rate limiting
  - consecutive-error budget

## Merge strategy

Do not merge the branch wholesale.

Reasons:

- `origin/feat/plugin-hardening` is far from current HEAD and includes broad unrelated churn.
- `git diff --shortstat main..origin/feat/plugin-hardening` shows large repo-wide divergence.
- The safe approach is selective cherry-pick where clean and hand-port where protocol or architecture changed underneath it.

## Decision summary

### Merge now

1. RPC timeouts
2. Per-plugin RPC rate limiting
3. Consecutive-error budget on top of existing burst/error-window thresholds
4. Richer plugin settings schema:
   - `textarea`
   - `min`
   - `max`
   - `placeholder`

### Merge selectively after small redesign

1. `vault_contains:${string}` activation event

### Skip for now

1. lifecycle protocol rewrite in `0b4817a3`
2. `on_file_type:${string}` activation event
3. `on_startup_finished`

## Concrete plan

## Step 1: Hand-port RPC hardening from `0b4817a3`

### Scope

Port only the safety logic, not the lifecycle message rewrite.

### Files to update

Note: `src/lib/features/plugin/domain/` does not exist on the current branch and must be created.

- `src/lib/features/plugin/application/plugin_service.ts`
- `src/lib/features/plugin/application/plugin_error_tracker.ts`
- `src/lib/features/plugin/domain/rate_limiter.ts` (new)
- `src/lib/features/plugin/domain/rpc_timeout.ts` (new)
- `tests/unit/services/plugin_error_tracker.test.ts`
- `tests/unit/services/plugin_service_hardening.test.ts`
- `tests/unit/domain/rate_limiter.test.ts`
- `tests/unit/domain/rpc_timeout.test.ts`

### Changes

#### 1. Add RPC timeout utility

Port from `0b4817a3`:

- new `RpcTimeoutError`
- `get_rpc_timeout(method)`
- `with_timeout(promise, method, timeout_ms?)`

Keep the timeout policy narrow and explicit:

- default timeout for normal RPC calls
- longer timeout for filesystem-heavy vault calls

#### 2. Add per-plugin rate limiting

Port `PluginRateLimiter` as a small domain utility.

Apply it in `PluginService.handle_rpc()` before dispatch.

Expected behavior:

- reject with clear error if a plugin exceeds the request budget
- reset limiter state on unload / clear-active-vault
- add `rate_limiter.clear_all()` call in `PluginService.clear_active_vault()`

#### 3. Strengthen `PluginErrorTracker`

Port only these additions:

- consecutive error counter
- `record_success(plugin_id)`
- `get_consecutive_errors(plugin_id)` if useful in tests / UI

Retain current burst-based thresholds and add consecutive-budget auto-disable on top.

Update `reset(plugin_id)` and `clear_all()` to also clear the new `consecutive_errors` map.

#### 4. Update `PluginService.handle_rpc()`

Add, in order:

1. rate-limit check
2. timeout wrapper around RPC handler execution
3. `record_success()` on non-error response
4. keep existing warn/auto-disable behavior

### Explicitly do not port from `0b4817a3`

- `send_lifecycle_hook(...)`
- new `{ type: "lifecycle", hook, context }` message format
- `SettingChangedCallback` / `set_on_setting_changed()` / `on_settings_change` hook delivery
- setting-change lifecycle hook delivery
- artificial unload delay tied to the new lifecycle protocol

Reason:

- current SDK and docs still depend on `method: "lifecycle.activate"` / `method: "lifecycle.deactivate"`
- changing the protocol now would create doc/SDK/plugin drift for limited practical gain

Implementer warning: the source branch itself has a broken lifecycle protocol — `0b4817a3` changes `plugin_iframe_host.svelte` to send `{ type: "lifecycle", hook: "activate" }` but never updates `carbide_plugin_api.js`, which still listens for `msg.method === "lifecycle.activate"`. Do not trust the source branch's lifecycle integration for correctness.

## Step 2: Hand-port richer settings schema from `b8edde58`

### Preferred path

Hand-port only. Do NOT cherry-pick `b8edde58` — it builds on top of `1f04cd0b` and its `ports.ts` includes activation event types (`on_startup_finished`, `on_file_type:${string}`, `vault_contains:${string}`) that this plan explicitly defers in Step 3.

### Files to update

- `src/lib/features/plugin/ports.ts`
- `src/lib/features/plugin/ui/plugin_settings_dialog.svelte`
- `src/lib/components/ui/textarea/index.ts`
- `src/lib/components/ui/textarea/textarea.svelte`
- `tests/unit/features/plugin/ui/plugin_settings_dialog.test.ts`

### Changes

Extend `PluginSettingSchema` with:

- `type: "textarea"`
- `min?: number`
- `max?: number`
- `placeholder?: string`

UI behavior:

- render `textarea` with the shared shadcn textarea component
- clamp numeric input to `min` / `max`
- pass placeholders through for string / textarea inputs where appropriate

### Validation

Add or port tests for:

- textarea rendering
- placeholder rendering
- numeric clamp behavior

## Step 3: Re-evaluate activation events and only port `vault_contains` if still needed

### Recommendation

Do not cherry-pick `1f04cd0b`.

Hand-port only `vault_contains:${string}` if there is an immediate product use-case.

### Why not cherry-pick the commit

- it bundles three activation additions together
- `on_file_type:${string}` overlaps with existing `on_file_open:${string}` and adds another way to express roughly the same trigger
- `on_startup_finished` introduces a startup-phase distinction that is not otherwise modeled clearly in the app

### If porting `vault_contains`

Update:

- `src/lib/features/plugin/ports.ts`
- `src/lib/features/plugin/application/plugin_service.ts`
- add `src/lib/features/plugin/domain/match_activation_event.ts`
- add focused tests under `tests/unit/domain/` and `tests/unit/services/`

Design constraints:

- keep matching rules simple and documented
- do not add `on_file_type` in the same change
- do not add `on_startup_finished` in the same change
- ensure vault file listing is injected through an explicit dependency, not hidden global access

### If not porting now

Create a follow-up issue and defer until there is a concrete plugin that needs vault-shape lazy activation.

## Step 4: Keep lifecycle contract stable for this merge

### Preserve

- host-to-plugin lifecycle messages:
  - `method: "lifecycle.activate"`
  - `method: "lifecycle.deactivate"`

### Files that must stay aligned

- `src/lib/features/plugin/ui/plugin_iframe_host.svelte`
- `src-tauri/src/features/plugin/sdk/carbide_plugin_api.js`
- `docs/plugin_howto.md`

### Rule

Do not change lifecycle message shape in this merge unless all three are updated together and the plugin API version is intentionally bumped.

## Step 5: Documentation updates

If Step 1 and Step 2 land, update:

- `docs/plugin_howto.md`
- `carbide/TODO.md`

Doc additions:

- mention runtime RPC timeout behavior
- mention runtime RPC rate limiting
- document richer settings schema fields and textarea support

Do not document `vault_contains` unless it is actually merged.

## Step 6: Verification checklist

For the final merged work, run:

- `pnpm check`
- `pnpm lint`
- `pnpm test`
- `cd src-tauri && cargo check`
- `pnpm format`

Focus test coverage on:

- timeout behavior
- rate-limit rejection behavior
- success resets consecutive-error budget
- repeated failures still auto-disable plugin
- settings UI renders textarea / placeholder / numeric limits correctly
- existing lifecycle SDK behavior remains intact

## Suggested implementation order

1. Hand-port Step 1 safety hardening
2. Run frontend tests for plugin service / domain utilities
3. Port Step 2 settings schema improvements
4. Run plugin UI tests
5. Update docs
6. Only then decide whether `vault_contains` is needed now

## Safe merge mechanics

### Option A: recommended

Hand-port Step 1 and Step 2 onto a fresh branch from current mainline work.

Pros:

- avoids old-branch drift
- keeps protocol decisions deliberate
- makes review easier

### Option B: not recommended

Cherry-pick `b8edde58` only, then hand-port Step 1.

Reason: `b8edde58` includes activation event type changes from `1f04cd0b` in `ports.ts` that contradict Step 3 deferral decisions.

### Option C: not recommended

Cherry-pick `0b4817a3` or `1f04cd0b` wholesale.

Reason:

- both include bundled behavior that should be split before merge

## Final recommendation

Ship a narrow "plugin safety + settings DX" merge now:

- hand-port RPC timeouts
- hand-port per-plugin rate limiting
- hand-port consecutive-error budget
- port textarea/min/max/placeholder settings support

Do not merge lifecycle protocol changes now.

Do not merge `on_file_type` or `on_startup_finished` now.

Treat `vault_contains` as a separate, optional follow-up once there is a real plugin that benefits from it.
