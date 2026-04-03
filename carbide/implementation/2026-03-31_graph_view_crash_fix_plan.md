# Graph view crash fix plan

@carbide

## Goal

Stop the graph view from crashing the desktop app when the graph loads in the packaged macOS build.

## Current diagnosis

The latest evidence points away from the original `read_note` hypothesis and toward a failure in the WebKit custom URL scheme path.

What we know:

1. The app dies with `EXC_CRASH (SIGABRT)` on the main process.
2. Right before the crash, WebContent starts custom URL scheme requests through the UI process.
3. The graph indexing path has already been changed to use raw vault file reads, but the crash still happens.
4. Carbide registers custom scheme handlers in `src-tauri/src/app/mod.rs`.
5. The likely failure surface is `src-tauri/src/shared/storage.rs`, where scheme responses are built and several paths still use `unwrap()`.

The practical conclusion is simple. The graph view is surfacing a bad asset or scheme response path that currently aborts the app instead of failing gracefully.

## Constraints from architecture

This needs to follow the repo architecture, not fight it.

1. The Rust backend stays a thin native boundary.
2. The frontend must not grow ad hoc crash workarounds for backend failures.
3. IO boundary fixes belong in the backend scheme and storage handling, not in Svelte components.
4. Any frontend changes should be limited to load shaping and error surfacing, not core correctness.

## Primary implementation strategy

### Phase 1. Make custom scheme handling non fatal

Target files:

- `src-tauri/src/app/mod.rs`
- `src-tauri/src/shared/storage.rs`
- `src-tauri/src/shared/asset_cache.rs`

Tasks:

1. Audit every custom scheme request path used by:
   - `carbide-asset`
   - `carbide-plugin`
   - `carbide-excalidraw`
2. Remove all `unwrap()` and equivalent panic paths from request parsing, header construction, MIME resolution, file reads, and response building.
3. Replace panic behavior with explicit `Result` handling that returns valid error responses.
4. Ensure every failure path returns a well formed HTTP style response with:
   - status code
   - content type
   - body
5. Add structured logging for scheme failures so the next failure gives a concrete filename, scheme, and reason.

Exit condition:

Opening graph view can no longer abort the app because a scheme request failed.

### Phase 2. Identify the exact failing asset class

Target files:

- `src-tauri/src/shared/storage.rs`
- graph related frontend code that emits graph node content or asset URLs

Tasks:

1. Log the exact incoming scheme URL, normalized path, and resolved file target for graph initiated loads.
2. Reproduce with the failing vault and capture the first non success scheme request.
3. Determine which class of resource is actually failing:
   - malformed URL
   - missing file
   - invalid percent decoding
   - unsupported MIME or extension
   - path traversal guard rejection
   - cache inconsistency
   - response builder failure
4. Tighten only the relevant code path once the concrete failure is known.

Exit condition:

We know the concrete bad input that used to trigger the abort.

### Phase 3. Harden graph load behavior

Target files:

- `src/lib/features/graph/adapters/graph_remark_adapter.ts`
- related graph application files if needed

Tasks:

1. Keep the raw file read path that replaced `read_note`.
2. Revisit `BATCH_CONCURRENCY = 20` and reduce it if scheme or WebKit pressure still spikes during graph startup.
3. Add explicit failure handling for unreadable notes so a few bad files do not poison the whole graph build.
4. Surface partial graph load state in the UI instead of assuming all files succeed.

This is secondary hardening, not the main fix.

Exit condition:

Graph load remains stable even with a few bad notes or slow files.

## Test plan

### Rust side

Add focused tests around the scheme boundary.

1. Unit tests for storage response helpers.
2. Tests for invalid path input, unknown file, malformed URL, and unsupported asset cases.
3. Tests that assert error cases return responses instead of panicking.

Likely locations:

- `src-tauri/src/shared/storage.rs`
- `src-tauri/src/tests` or the nearest existing Rust test module

### Frontend side

1. Add tests for graph indexing with unreadable or invalid note inputs.
2. Verify graph services tolerate partial failures.
3. Verify the graph UI can render a degraded result instead of crashing or hanging.

Likely locations:

- `tests/unit/...graph...`

### Manual validation

1. Rebuild the packaged macOS app.
2. Open the same vault and load graph view.
3. Confirm no abort occurs.
4. Confirm scheme failures, if any, are logged as handled errors.
5. Confirm graph still renders with expected nodes and links.

## Sequencing

Recommended order:

1. Remove panic paths from scheme handlers.
2. Add scheme failure logging.
3. Reproduce and capture the exact failing request.
4. Fix the concrete failing asset path.
5. Add graph side partial failure handling if still needed.
6. Add regression tests.

Do not start by tweaking graph UI behavior. That is treating symptoms.

## Risks and tradeoffs

1. If we only lower graph concurrency, we may hide the crash without fixing the real fault.
2. If we only patch one failing extension or file type, another malformed resource will crash later.
3. Over broad fallback behavior could mask legitimate security checks, especially around path normalization and traversal.

The right tradeoff is strict validation plus non fatal failure handling.

## Definition of done

This work is done when all of the following are true:

1. Graph view no longer crashes the packaged app.
2. Custom scheme failures return handled error responses instead of aborting.
3. The exact root cause is documented in the final fix notes.
4. Regression tests cover the failing request class.
5. Graph loading tolerates partial file failures.
