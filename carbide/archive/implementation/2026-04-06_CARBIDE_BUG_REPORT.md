# Carbide Bug Triage and Fix Plan

Date: 2026-04-06
Purpose: convert rough observations into a working document for identifying, reproducing, fixing, and verifying bugs.

## How to use this document

For each bug:

1. Reproduce it on the latest local build.
2. Confirm whether it is editor-only, source-only, preview-only, or cross-surface.
3. Isolate the owning layer before changing code: editor, markdown sync, link resolution, IWE integration, toolbar/action wiring, LSP startup, lint session management, or packaging.
4. Add a regression test before or alongside the fix when the behavior is deterministic.
5. Record the exact verification step and result.

## Priority order

### P0

- Markdown LSP startup crashes on large or slow vaults.
- GitHub release bundle appears to miss IWE support and may fall back incorrectly.
- Link creation/link editing can corrupt source text.

### P1

- Inline note embedding does not work.
- Link typing/substitution shows malformed output.
- Toolbar or action sync may be causing editor inconsistencies.

### P2

- Collapsible heading keyboard behavior.
- Code fence selection and horizontal scrolling.
- Escaped character rendering in source mode.

## Bug inventory

| ID      | Title                                                         | Severity | Area                                           | Current signal                     |
| ------- | ------------------------------------------------------------- | -------- | ---------------------------------------------- | ---------------------------------- |
| BUG-001 | Link substitution produces malformed markdown                 | P1       | editor + link resolution + IWE/LSP interaction | Repro observed, root cause unknown |
| BUG-002 | Inline note embedding does not work                           | P1       | editor embedding                               | Repro observed, needs minimal case |
| BUG-003 | Collapsible headings do not handle Return correctly           | P2       | editor UX                                      | Repro observed                     |
| BUG-004 | Selecting text inside code fences breaks horizontal scrolling | P2       | editor UX                                      | Repro observed                     |
| BUG-005 | GitHub bundle does not package IWE correctly                  | P0       | release packaging + tool startup               | Strong evidence                    |
| BUG-006 | Image/link actions rewrite or corrupt source text             | P0       | editor command pipeline                        | Strong evidence                    |
| BUG-007 | Source editor shows escaped characters in links unexpectedly  | P2       | source-mode rendering/serialization            | Needs expected-behavior decision   |
| BUG-008 | Toolbar may have introduced sync regressions                  | P1       | action wiring + sync                           | Suspicion only                     |
| BUG-009 | Markdown LSP startup fails with Marksman timeout / early EOF  | P0       | Rust LSP service + vault scanning              | Confirmed in logs                  |
| BUG-010 | Lint close-file lifecycle is inconsistent                     | P1       | lint session management                        | Confirmed in logs                  |

## Detailed triage

### BUG-001 — Link substitution produces malformed markdown

Symptoms:

- Parenthesis and link substitution behave incorrectly.
- Trailing square brackets appear in some links.
- Behavior may differ between wikilinks and standard markdown links.
- Typing a path inside a link can trigger malformed output.

Likely suspects:

- Conflict between FTS/link resolution and markdown LSP completions.
- Shared handling path for wikilinks and standard markdown links is not normalized.
- Editor transaction or post-processing step applies substitution twice.

Questions to answer:

- Does this reproduce with LSP disabled?
- Does it reproduce with IWE disabled?
- Does it affect only forward links, or also backlinks-derived insertions?
- Is corruption introduced in ProseMirror state, markdown serialization, or source rewrite?

Fix strategy:

- Build a minimal matrix: LSP on/off, IWE on/off, wikilink/markdown link, source/editor surface.
- Trace the action path that inserts or transforms links.
- Add regression tests for link insertion and serialization before patching behavior.

### BUG-002 — Inline note embedding does not work

Symptoms:

- Inline note embedding appears non-functional.

Unknowns:

- Is insertion failing, rendering failing, or round-trip serialization failing?
- Does the syntax persist in source but fail in rich editor, or vice versa?

Fix strategy:

- Reduce to one known-good syntax and one minimal sample note.
- Verify parse -> editor render -> serialize -> reopen round trip.
- Add a focused test for embed parsing and rendering behavior.

### BUG-003 — Collapsible headings do not handle Return correctly

Symptoms:

- Pressing Return around collapsible headings does not move downward as expected.

Fix strategy:

- Define the expected key behavior first.
- Reproduce with expanded and collapsed states.
- Check whether the keymap is intercepted by heading plugin logic.

### BUG-004 — Code fence selection breaks horizontal scrolling

Symptoms:

- While text is selected inside code fences, horizontal scrolling becomes unusable.
- May be related to expandable or adjustable editor behavior.

Fix strategy:

- Reproduce with long single-line code blocks.
- Verify whether the issue is native browser selection behavior, custom scroll container behavior, or editor plugin interference.
- Add a UI-level regression test if feasible; otherwise document a manual verification case.

### BUG-005 — GitHub bundle does not package IWE correctly

Symptoms:

- Release bundle version v1.13.0 does not appear to bundle IWE correctly.
- Marksman startup may also be incorrect or incomplete in release builds.
- Desired fallback: preserve LSP functionality even if some IWE functionality is unavailable.

Evidence:

- Runtime log shows fallback from requested provider `iwes` to effective provider `marksman` because IWE binary resolution failed.
- Log also shows markdown LSP startup failures after fallback.

Fix strategy:

- Verify release artifact contents, binary locations, permissions, and startup paths.
- Separate binary-resolution failures from LSP initialization failures.
- Make fallback behavior explicit and testable.
- Ensure release validation includes startup checks for both IWE and Marksman.

### BUG-006 — Image/link actions rewrite or corrupt source text

Symptoms:

- IWE linking/image linking breaks source text.
- Actions may reformat content unexpectedly.
- “Create link” may not route to the intended destination.
- Multiple related actions may be no-ops or partially applied.

Likely suspects:

- Command dispatch mismatch between toolbar/action registry/editor command handlers.
- Source rewrite path is applying a full-document replacement instead of a precise transformation.
- Serialization layer is normalizing more than intended.

Fix strategy:

- Identify the exact action IDs and command handlers for create-link and image-link flows.
- Compare expected transaction scope with actual resulting markdown diff.
- Add regression tests around targeted source mutations.

### BUG-007 — Escaped characters in source editor links may be wrong

Symptoms:

- Source editor shows escaped characters inside links.

Decision needed:

- Is this actually a bug, or is the source view showing correct literal markdown escaping?

Fix strategy:

- Define expected behavior for source view vs rich editor.
- Confirm whether escape sequences round-trip correctly and display correctly in preview/editor.

### BUG-008 — Toolbar may have introduced sync regressions

Symptoms:

- Some synchronization issues may have started after toolbar changes.

Status:

- This is a hypothesis, not yet evidence.

Fix strategy:

- Diff behavior with toolbar-triggered actions versus keyboard or command-palette actions.
- Audit toolbar handlers for bypasses around the normal action registry and service flows.

### BUG-009 — Markdown LSP startup fails with timeout / early EOF

Symptoms:

- Marksman times out while reading vault files.
- LSP initialization closes during startup.
- Restart loop occurs.
- `early eof` is later observed.

Strong evidence:

- Timeout while reading a file under an iCloud-backed vault path.
- Repeated `LSP initialization failed: LSP closed during init`.
- Repeated restart attempts.
- Later `LSP read error: early eof`.

Likely suspects:

- Marksman workspace scan is too expensive or fragile on the target vault.
- iCloud-backed files may block or stall reads.
- Startup may lack filtering, timeouts, or degraded-mode behavior for problematic paths.

Fix strategy:

- Reproduce against a minimal local vault and the problematic iCloud-backed vault.
- Confirm whether failure is specific to one file, file size, storage backend, or workspace breadth.
- Add guardrails in LSP startup: path filtering, startup timeout handling, clearer degraded mode, and better user-visible error states.

### BUG-010 — Lint close-file lifecycle is inconsistent

Symptoms:

- `lint_close_file` is called when no active lint session exists.
- Repeats multiple times for the same vault.

Likely suspects:

- File-close notifications are emitted after session teardown.
- Session lifecycle is duplicated or not reference-counted correctly.
- Watcher/editor teardown order is wrong.

Fix strategy:

- Trace lint session open/close ownership.
- Make close idempotent.
- Add tests for open -> close -> close and teardown during vault shutdown.

## Cross-bug hypotheses

1. There may be one shared failure cluster around editor actions, markdown serialization, and toolbar-triggered mutations.
2. There may be a separate infrastructure failure cluster around release packaging, external tool discovery, and LSP startup.
3. The iCloud-backed vault may be amplifying LSP startup failures and causing secondary feature degradation.
4. Some “editor bugs” may actually be fallout from provider fallback or disabled tooling states.

## Recommended debugging sequence

1. Stabilize tool startup.
   - Fix BUG-005 and BUG-009 first.
   - Until LSP/tool startup is reliable, editor-link bugs may be noisy or misleading.

2. Verify action routing.
   - Trace create-link, image-link, and toolbar-triggered commands.
   - Focus on BUG-001, BUG-006, and BUG-008 together.

3. Re-check embed behavior.
   - Once action routing and LSP/tooling are stable, revisit BUG-002.

4. Clean up lifecycle management.
   - Fix BUG-010 to reduce background noise and teardown errors.

5. Address lower-risk UX bugs.
   - BUG-003, BUG-004, BUG-007.

## Reproduction matrix to fill in during work

| Bug     | Latest local dev build | Release build | LSP off | IWE off | Minimal local vault | iCloud vault | Test added |
| ------- | ---------------------- | ------------- | ------- | ------- | ------------------- | ------------ | ---------- |
| BUG-001 | TODO                   | TODO          | TODO    | TODO    | TODO                | TODO         | TODO       |
| BUG-002 | TODO                   | TODO          | TODO    | TODO    | TODO                | TODO         | TODO       |
| BUG-003 | TODO                   | TODO          | n/a     | n/a     | TODO                | TODO         | TODO       |
| BUG-004 | TODO                   | TODO          | n/a     | n/a     | TODO                | TODO         | TODO       |
| BUG-005 | TODO                   | TODO          | n/a     | n/a     | TODO                | TODO         | TODO       |
| BUG-006 | TODO                   | TODO          | TODO    | TODO    | TODO                | TODO         | TODO       |
| BUG-007 | TODO                   | TODO          | n/a     | n/a     | TODO                | TODO         | TODO       |
| BUG-008 | TODO                   | TODO          | TODO    | TODO    | TODO                | TODO         | TODO       |
| BUG-009 | TODO                   | TODO          | n/a     | n/a     | TODO                | TODO         | TODO       |
| BUG-010 | TODO                   | TODO          | n/a     | n/a     | TODO                | TODO         | TODO       |

## Verification checklist template

For each fixed bug, capture:

- exact reproduction steps
- expected result
- actual result before fix
- code path changed
- automated coverage added
- manual verification after fix
- whether release build behavior was also verified

## Relevant error messages

These are the specific runtime messages most relevant to the LSP and lint-related bugs in this report.

### Markdown LSP / provider resolution

- `Markdown LSP requested_provider=iwes effective_provider=marksman reason=iwe_binary_resolution_failed error=IWE not found — install via Settings > Tools or place on PATH`
- `markdown_lsp_start: LSP process spawn failed: LSP closed during init`
- `LSP initialization failed: LSP closed during init`
- `LSP read error: early eof`

### Marksman startup / vault scan

- `Operation timed out : '/Users/aar126/Library/Mobile Documents/com~apple~CloudDocs/JishnuLab/1_NOTES/9999_ARCHIVE/archive/5_NOTES_pages_archives/pages/contents.md'`
- `Marksman encountered a fatal error`
- `Please, report the error at https://github.com/artempyanykh/marksman/issues`
- `RestartableLspClient: spawn failed: LSP process spawn failed: LSP closed during init`
- `RestartableLspClient: retrying in 1000ms (attempt 1)`
- `RestartableLspClient: retrying in 2000ms (attempt 2)`

### Lint lifecycle

- `lint_close_file: No active lint session for vault 8a297a811f39bdf9b55460227d07f83266d1570b604d339e2fafd609667f9c9f`
- `[lint_service] Failed to notify file closed tauri invoke failed: lint_close_file: No active lint session for vault ...`

## Key log evidence

### Markdown LSP / Marksman

Observed on 2026-04-06:

- Marksman timed out reading a file under an iCloud-backed vault path.
- LSP initialization failed with `LSP closed during init`.
- Restartable client retried and failed again.
- Startup later reported fallback from requested provider `iwes` to effective provider `marksman` because `IWE not found`.
- A later error reported `LSP read error: early eof`.

### Lint lifecycle

Observed on 2026-04-06:

- Repeated `lint_close_file` failures reported `No active lint session for vault ...`.
- This strongly suggests close notifications are not aligned with session ownership.

## Open decisions

1. What is the correct source-mode representation for escaped link characters?
2. Should LSP degrade gracefully on problematic vaults instead of failing startup?
3. If IWE is unavailable, which editor features must still work through Marksman alone?
4. Are toolbar actions allowed to bypass any existing editor command path? They probably should not.

## Exit criteria

This document is complete when:

- every P0 and P1 bug has a confirmed owner and reproduction case
- every confirmed fix has either an automated test or a documented reason it cannot
- release build packaging is validated for external tools
- LSP startup is robust on both minimal local vaults and the problematic iCloud-backed vault
