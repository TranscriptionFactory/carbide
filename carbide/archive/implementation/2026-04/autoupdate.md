# Auto Update Check + One-Click Update + Skip Version

## Context

The app has `tauri-plugin-updater` configured and a manual "Check for Updates" action (menu + command palette), but no automatic check. Users won't know updates exist unless they manually look. We want a once-per-day, non-blocking toast on startup when an update is available, with direct "Update" and "Skip" buttons.

## Approach

Create a startup reactor (follows existing `git_auto_fetch.reactor` pattern) that:

1. Checks localStorage for last check timestamp — skips if <24h ago
2. Waits 15s after mount (don't compete with vault loading)
3. Silently checks for updates (no loading toast)
4. If update available AND version !== skipped version: shows info toast with **"Update"** and **"Skip"** buttons
5. "Update" → direct download + install + restart prompt
6. "Skip" → stores the version in localStorage, suppresses toast until a newer version is available
7. If no update, error, or version is skipped: does nothing

## localStorage Keys

- `badgerly:last_update_check` — ISO timestamp of last check
- `badgerly:skipped_update_version` — version string (e.g. `"1.1.0"`) the user chose to skip. Cleared implicitly when a newer version supersedes it.

## Files to Change

### 1. `src/lib/app/orchestration/app_actions.ts` — Add silent check + direct install helpers

**`check_for_update_silently()`** — returns the `Update` object (or `null`) without any toasts. Swallows errors.

```ts
export async function check_for_update_silently() {
  if (!is_tauri) return null;
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    return await check();
  } catch {
    return null;
  }
}
```

**`execute_download_and_install(update)`** — takes an existing `Update` object, shows download progress toast, installs, prompts restart. Extracted from the existing `execute_app_check_for_updates()` download path.

Also refactor `execute_app_check_for_updates()` to reuse these two helpers (keeps existing manual flow working, removes duplication).

### 2. `src/lib/reactors/update_check.reactor.svelte.ts` — New file (~55 lines)

- `$effect.root()` → `$effect()` pattern (same as `git_auto_fetch.reactor.svelte.ts`)
- Throttle: localStorage `badgerly:last_update_check`, 24h interval
- Skip: localStorage `badgerly:skipped_update_version`
- 15s startup delay via `setTimeout`
- Calls `check_for_update_silently()`, marks checked
- If update found AND `update.version !== skipped_version`:
  ```ts
  toast.info(`Badgerly v${update.version} is available`, {
    duration: 30_000,
    action: {
      label: "Update",
      onClick: () => void execute_download_and_install(update),
    },
    cancel: {
      label: "Skip",
      onClick: () => localStorage.setItem(SKIPPED_KEY, update.version),
    },
  });
  ```
- No context args needed (imports functions directly)

### 3. `src/lib/reactors/index.ts` — Register reactor

Import and add `create_update_check_reactor()` to `unmounts` array.

### 4. `tests/reactors/update_check_reactor.test.ts` — New test file

Unit test the pure logic functions:

- `should_check()` — true when no timestamp, true when >24h, false when <24h
- `mark_checked()` — writes valid ISO timestamp
- `is_version_skipped(version)` — true when matches stored version, false otherwise
- `skip_version(version)` — writes version to localStorage

## Update Flow (user perspective)

1. App launches → 15s → silent check in background
2. If update available (and not skipped): toast appears: **"Badgerly v1.1.0 is available" [Update] [Skip]**
3. **Ignore**: toast auto-dismisses in 30s. Will show again next day.
4. **Click "Update"**: loading toast → download + install → "restart to apply" toast
5. **Click "Skip"**: stores `"1.1.0"` in localStorage. Toast won't appear for this version again. When v1.2.0 releases, the cycle repeats.
6. Manual "Check for Updates" (menu/command palette) always works regardless of skip — only the auto-toast is suppressed.

## What this intentionally skips

- No settings toggle (non-disruptive enough; add if users request)
- No About tab (orthogonal scope)
- No persistent badge/indicator (toast is sufficient)
- No periodic re-check while running (fires once on mount; sufficient for v1)

## Verification

1. `pnpm check` — type check passes
2. `pnpm lint` — no new lint errors
3. `pnpm test` — new + existing tests pass
4. `cargo check` from `src-tauri/` — Rust still compiles
5. Manual test matrix:
   - Fresh install (no localStorage): toast appears after 15s
   - Click "Skip": toast suppressed on next launch
   - New version after skip: toast reappears (skipped version doesn't match)
   - Click "Update": download + install flow works
   - Within 24h: no re-check
