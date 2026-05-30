# Phase 3: Inline AI Menu + Streaming — Implementation Plan

**Date:** 2026-04-17 (updated 2026-04-19)
**Reference:** `carbide/research/mdit_comparison.md`, `carbide/plans/2026-04-17_mdit_port_plan.md`
**MDit Code:** `/Users/abir/src/KBM_Notes/mdit`

---

## Context

Phase 1 (quick wins) and Phase 2 (callout blocks) of the mdit port are complete. Phase 3 is the highest-value item: bringing AI from sidebar-only to inline editing flow with streaming text insertion. Currently, Carbide's AI is panel-based with no streaming — the `AiPort.execute()` interface returns full output after completion. The mdit reference app uses Vercel AI SDK with React/Plate.js for inline AI with real-time streaming.

### Current AI Architecture (as of 2026-04-19)

- **Port**: `AiPort` in `src/lib/features/ai/ports.ts` — `check_cli()` + `execute()` (non-streaming)
- **Adapter**: `ai_tauri_adapter.ts` — wraps `tauri_invoke("ai_check_cli")` and `tauri_invoke("ai_execute_cli")`
- **Service**: `AiService` in `application/ai_service.ts` — takes `AiPort` + `VaultStore`, builds prompts, calls `ai_port.execute()`
- **Actions**: `ai_actions.ts` — panel-based dialog actions (`ai.open_assistant`, `ai.execute`, `ai.apply_result`, etc.)
- **State**: `AiStore` in `state/ai_store.svelte.ts` — dialog state management
- **Rust**: `src-tauri/src/features/ai/service.rs` — `ai_check_cli` + `ai_execute_cli` commands, registered in `src-tauri/src/app/mod.rs:163-165`
- **DI**: `AiPort` wired via `src/lib/app/di/app_ports.ts` → `create_app_context.ts`
- **Types**: `AiProviderConfig` lives in `$lib/shared/types/ai_provider_config.ts` (shared); other AI types in `domain/ai_types.ts`

## Scope

**This phase: 3.1 (AI Menu Plugin) + 3.2 (Streaming Text Insertion)**

Items 3.3 (Vault Tools), 3.4 (Custom Commands), 3.5 (Multi-Provider) deferred to follow-up phases.

## Key Decision: Tauri-Backend Streaming with AsyncIterable Frontend API

**Stream through Rust via Tauri events**, not direct `fetch()` from the frontend. The TypeScript adapter wraps Tauri events into an `AsyncIterable<AiStreamChunk>` for clean consumption.

**Rationale:**

- **API keys stay in Rust.** The existing `AiPort` keeps secrets in the backend. Direct `fetch()` from the frontend would leak API keys to the renderer process — a security regression even in a local webview.
- **One HTTP stack.** Non-streaming AI already goes through Tauri invoke → Rust. A parallel `fetch()` path from the frontend means two codepaths for the same provider, two places to handle proxy/TLS/retry.
- **Provider normalization belongs in the backend.** SSE parsing, CLI stdout streaming, and future local model protocols (Ollama, llama.cpp) are diverse — Rust normalizes them into a uniform chunk event stream.
- **Proven event pattern.** The codebase already uses `AppHandle.emit()` → `listen()` for workspace indexing progress, toolchain events, and file watcher events. Streaming AI chunks follows the same pattern.
- **AsyncIterable is the right frontend API.** Composable, supports backpressure, natural `break` for cancellation, easy to layer transforms (e.g. MarkdownJoiner). Callback-based `on_chunk` inverts control and is harder to compose.
- **No new dependencies.** Zero new npm packages. Uses existing Tauri event infrastructure.

> **Note:** The Vercel AI SDK evaluation is preserved in `~/.claude/plans/peppy-munching-wren.md` for future reference. Rejected for the same reason — adds ~300 KB for what the Tauri event bridge already provides.

### How it works

```
Frontend                          Rust Backend
────────                          ────────────
invoke("ai_stream_start", req)  → spawn async task, start CLI/API call
                                   ↓
listen("ai:chunk:{request_id}")  ← emit chunks as they arrive (line-by-line from CLI stdout,
                                   or parsed from SSE for API providers)
                                   ↓
invoke("ai_stream_abort", id)   → kill child process / drop AbortController
                                   ↓
                                   emit { type: "done" } or { type: "error" }
```

The TypeScript adapter wraps this into `AsyncIterable<AiStreamChunk>` using an async queue that yields on each event and resolves on done/error.

---

## Architecture

### New Port: `AiStreamPort`

Extends the existing AI feature — new files alongside current ones:

```
src/lib/features/ai/
├── ports.ts                          # ADD AiStreamPort interface (alongside existing AiPort)
├── adapters/
│   ├── ai_tauri_adapter.ts          # EXISTING: non-streaming adapter
│   └── ai_stream_adapter.ts         # NEW: Tauri event → AsyncIterable adapter
├── domain/
│   ├── ai_stream_types.ts           # NEW: Streaming domain types
│   └── markdown_joiner.ts           # NEW: Reassembles partial markdown syntax from chunks
```

```ts
interface AiStreamPort {
  stream_text(input: AiStreamRequest): AsyncIterable<AiStreamChunk>;
  abort(request_id: string): void;
}

type AiStreamRequest = {
  provider_config: AiProviderConfig;  // from $lib/shared/types/ai_provider_config
  system_prompt: string;
  messages: AiMessage[];
  model?: string;
};

type AiStreamChunk =
  | { type: "text"; text: string }
  | { type: "error"; error: string }
  | { type: "done" };
```

### Tauri Streaming Adapter

The adapter implements `stream_text()` as an `async function*` that bridges Tauri events into an `AsyncIterable`:

```ts
async function* stream_text(input: AiStreamRequest): AsyncIterable<AiStreamChunk> {
  const request_id = crypto.randomUUID();
  const queue = new AsyncQueue<AiStreamChunk>();  // push/pull async queue

  const unlisten = await listen<AiStreamEvent>(
    `ai:chunk:${request_id}`,
    (event) => queue.push(event.payload),
  );

  try {
    await tauri_invoke("ai_stream_start", { requestId: request_id, ...input });
    yield* queue;  // yields chunks as they arrive, blocks between events
  } finally {
    unlisten();
  }
}

abort(request_id: string) {
  void tauri_invoke("ai_stream_abort", { requestId: request_id });
}
```

`AsyncQueue` is a small (~30 line) utility: a linked list of promises where `push()` resolves the current pending `pull()`, and the async iterator terminates when a `done` or `error` chunk arrives.

### Rust Streaming Commands

```
src-tauri/src/features/ai/
├── service.rs                        # EDIT: Add ai_stream_start, ai_stream_abort commands
├── stream.rs                         # NEW: Streaming execution (CLI + future API)
├── mod.rs                            # EDIT: Export stream module
```

**`ai_stream_start`** command:
1. Validates input (same checks as existing `ai_execute_cli` in `service.rs`)
2. Spawns a `tokio::task` that:
   - For CLI transport: runs `Command` with piped stdout, reads via `BufReader::lines()`, emits each line as `{ type: "text", text }` via `app.emit(&format!("ai:chunk:{request_id}"), chunk)`
   - For API transport (future): uses `reqwest` streaming response, parses SSE, emits text deltas
3. On process exit: emits `{ type: "done" }` or `{ type: "error", error }`
4. Stores the `JoinHandle` + child PID in a `DashMap<String, StreamHandle>` for abort

**`ai_stream_abort`** command:
1. Looks up `StreamHandle` by request ID
2. Kills child process (`child.kill()`) and aborts the task
3. Emits `{ type: "error", error: "aborted" }`

This follows the same pattern as `workspace_index_tauri_adapter.ts` + `search/service.rs` — emit typed events from Rust with a session ID, listen on the TS side, resolve when done/error arrives.

### MarkdownJoiner Transform

Sits between the raw stream and editor insertion. Buffers partial markdown syntax tokens so the editor never sees broken delimiters mid-stream.

```ts
class MarkdownJoiner {
  process_chunk(text: string): string;  // returns flushable text (may buffer partial syntax)
  flush(): string;                       // returns remaining buffer on stream end
}
```

- Buffers on `*`, `` ` ``, `[`, `|` — flushes when syntax completes (`**bold**`, `` `code` ``, `[link](url)`)
- False-positive flush: buffer > 30 chars or newline without completing a token
- Tracks `in_code_block` state: inside fences, flushes line-by-line (no syntax buffering)
- Plain text passes through immediately (no buffering overhead)

Used as a transform layer in the service:
```ts
async *stream_inline(input): AsyncGenerator<AiStreamChunk> {
  const joiner = new MarkdownJoiner();
  for await (const chunk of this.ai_stream_port.stream_text(input)) {
    if (chunk.type === "text") {
      const text = joiner.process_chunk(chunk.text);
      if (text) yield { type: "text", text };
    } else {
      const remaining = joiner.flush();
      if (remaining) yield { type: "text", text: remaining };
      yield chunk;
    }
  }
}
```

### ProseMirror Plugin: `ai_menu_plugin.ts`

```
src/lib/features/editor/adapters/
├── ai_menu_plugin.ts                # NEW: ProseMirror plugin (keymap + state + decorations)
```

**Plugin responsibilities:**
- Keymap: `Cmd+J` (Mac) / `Ctrl+J` (other) opens menu when cursor is in editor
- Plugin state tracks: `{ open, mode, streaming, anchor_pos, original_doc, ai_range_from, ai_range_to }`
- Decorations: highlight on AI-inserted range, animated dot at stream end
- Transaction metadata: `ai_menu_open`, `ai_menu_close`, `ai_accept`, `ai_reject`

**Menu modes** (matching mdit's three-state model):
- `cursor_command`: no selection → "Continue writing", "Summarize", "Expand"
- `selection_command`: text selected → "Improve", "Simplify", "Fix grammar", "Translate"
- `cursor_suggestion`: AI has returned text → "Accept", "Discard", "Try again"

### Floating Menu UI

```
src/lib/features/editor/ui/
├── ai_inline_menu.svelte            # NEW: floating popover component
```

Uses existing `@floating-ui/dom` (already installed) + `suggest_dropdown_utils.ts` patterns:
- `create_cursor_anchor(view)` for positioning
- `position_suggest_dropdown()` for flip/shift
- `mount_dropdown()` / `destroy_dropdown()` for lifecycle
- `attach_outside_dismiss()` for click-away

UI structure:
```
<div class="ai-inline-menu">
  {#if streaming}
    <LoadingBar /> (animated progress with "Writing..." text)
  {:else}
    <textarea /> (prompt input, auto-expand, Shift+Enter for newlines)
    <ModelSelector /> (dropdown from vault AI settings)
    <SubmitButton /> (ArrowUp icon, Cmd+Enter shortcut)
    <CommandList /> (filtered by menu mode)
  {/if}
</div>
```

### Editor Extension: `ai_inline_extension.ts`

```
src/lib/features/editor/extensions/
├── ai_inline_extension.ts           # NEW: thin wiring into assemble_extensions()
```

Follows the `EditorExtension` pattern from `extensions/types.ts`. Registered in `assemble_extensions()` in `extensions/index.ts` alongside the other extensions.

---

## Streaming Flow

1. User presses `Cmd+J` → plugin opens menu, anchored below selection/cursor
2. User types prompt or picks command → `ai.execute_inline` action fires
3. Action calls `AiService.stream_inline()` which:
   a. Snapshots current doc state (for reject/undo)
   b. Builds system + user prompt via `build_ai_prompt()`
   c. Calls `ai_stream_port.stream_text()`
   d. For each chunk: dispatches ProseMirror transaction inserting text at tracked position
4. During streaming: highlight decoration on AI range, dot cursor at end
5. On complete: menu switches to `cursor_suggestion` mode (Accept/Discard/Try again)
6. Accept: removes AI mark, keeps text, closes menu
7. Reject: replaces doc with snapshot, closes menu

---

## Decoration Strategy

- **AI text mark**: New ProseMirror mark `ai_generated` in schema — applied during streaming
- **Highlight**: Inline decoration from plugin matching `ai_generated` mark
  - `background: oklch(0.93 0.03 250)` (blue tint, matches Carbide's OKLCH palette)
  - Subtle, no colored text (respects Carbide's design language)
- **Stream cursor**: Widget decoration at end of AI range — small animated dot
  - CSS `@keyframes pulse` on a 10×10px circle
- On accept: remove all `ai_generated` marks from the range
- On reject: restore snapshot doc

---

## Service Layer

```ts
// In ai_service.ts — new method (AiService already takes AiPort via constructor DI)
// Add ai_stream_port as second port dependency

async *stream_inline(input: AiInlineRequest): AsyncGenerator<AiStreamChunk> {
  const joiner = new MarkdownJoiner();
  const prompt = build_ai_prompt({ mode: input.mode, ... });

  for await (const chunk of this.ai_stream_port.stream_text({ ... })) {
    if (chunk.type === "text") {
      const text = joiner.process_chunk(chunk.text);
      if (text) yield { type: "text", text };
    } else {
      const remaining = joiner.flush();
      if (remaining) yield { type: "text", text: remaining };
      yield chunk;  // done or error
    }
  }
}
```

The service owns the MarkdownJoiner lifecycle — the port yields raw chunks, the service yields syntax-safe chunks, the plugin inserts them into the editor.

---

## Actions

New action IDs to add to `src/lib/app/action_registry/action_ids.ts` (existing AI actions are at lines 260-271):

| Action ID | Purpose |
|---|---|
| `ai.open_inline_menu` | Open inline AI menu (Cmd+J handler) |
| `ai.execute_inline` | Start streaming with current prompt |
| `ai.accept_inline` | Accept AI text, remove marks |
| `ai.reject_inline` | Reject AI text, restore snapshot |
| `ai.close_inline_menu` | Close menu without accepting |

Registered in `ai_actions.ts` alongside the existing panel-based actions.

---

## Files to Create

| File | Purpose |
|---|---|
| `src/lib/features/ai/adapters/ai_stream_adapter.ts` | Tauri event → AsyncIterable streaming adapter (~80 lines) |
| `src/lib/features/ai/domain/ai_stream_types.ts` | Streaming types (AiStreamPort, AiStreamRequest, AiStreamChunk) |
| `src/lib/features/ai/domain/markdown_joiner.ts` | Partial markdown syntax buffering (~100 lines) |
| `src/lib/shared/utils/async_queue.ts` | Push/pull async queue for bridging events → AsyncIterable (~30 lines) |
| `src-tauri/src/features/ai/stream.rs` | Rust streaming execution (BufReader line-by-line + event emit) |
| `src/lib/features/editor/adapters/ai_menu_plugin.ts` | ProseMirror plugin (keymap, state, decorations) |
| `src/lib/features/editor/ui/ai_inline_menu.svelte` | Floating menu UI component |
| `src/lib/features/editor/extensions/ai_inline_extension.ts` | Extension wiring (returns `EditorExtension`) |
| `tests/unit/domain/markdown_joiner.test.ts` | MarkdownJoiner tests |
| `tests/unit/adapters/ai_stream.test.ts` | Streaming adapter tests |
| `tests/unit/adapters/ai_menu_plugin.test.ts` | Plugin tests |

## Files to Modify

| File | Change |
|---|---|
| `src/lib/features/ai/ports.ts` | Add `AiStreamPort` interface (keep existing `AiPort`) |
| `src/lib/features/ai/index.ts` | Re-export `AiStreamPort`, new types, `create_ai_stream_adapter` |
| `src/lib/features/ai/application/ai_service.ts` | Add `ai_stream_port: AiStreamPort` to constructor, add `stream_inline()` method |
| `src/lib/features/ai/application/ai_actions.ts` | Register 5 new inline AI actions (alongside existing panel actions) |
| `src/lib/features/ai/domain/ai_prompt_builder.ts` | Add inline AI prompt templates |
| `src/lib/features/editor/adapters/schema.ts` | Add `ai_generated` mark spec |
| `src/lib/features/editor/extensions/index.ts` | Add `create_ai_inline_extension()` to `assemble_extensions()` array |
| `src/lib/app/action_registry/action_ids.ts` | Add 5 new action IDs (after existing AI IDs at line ~271) |
| `src/lib/app/di/app_ports.ts` | Add `ai_stream: AiStreamPort` to ports type |
| `src/lib/app/di/create_app_context.ts` | Wire `AiStreamPort` adapter, pass to `AiService` constructor |
| `src/styles/editor.css` | AI highlight + cursor animation styles |
| `src-tauri/src/features/ai/service.rs` | Add `ai_stream_start`, `ai_stream_abort` commands |
| `src-tauri/src/features/ai/mod.rs` | Export `stream` module |
| `src-tauri/src/app/mod.rs` | Register new commands in `invoke_handler` (line ~163) |
| `src-tauri/src/tests/mod.rs` | Register new commands in test builder (line ~154) |

## No New Dependencies

Zero new npm or Cargo packages. Uses existing Tauri event infrastructure (`AppHandle.emit()` + `listen()` from `@tauri-apps/api/event`), `BufReader` from std, and native `AbortController` for frontend cancellation.

---

## Reusable Existing Code

- `suggest_dropdown_utils.ts` — `create_cursor_anchor`, `position_suggest_dropdown`, `mount_dropdown`, `destroy_dropdown`, `attach_outside_dismiss`
- `floating_toolbar_utils.ts` — additional floating UI patterns
- `build_ai_prompt()` from `ai_prompt_builder.ts` — XML prompt construction
- `AiProviderConfig` from `$lib/shared/types/ai_provider_config` — reuse for stream adapter config
- `AiTransport`, `AiProviderId` types from `domain/ai_types.ts` — transport config for stream adapter
- `slash_command_plugin.ts` — reference for ProseMirror plugin + dropdown pattern
- `callout_view_plugin.ts` — reference for node view with custom rendering
- `ai_tauri_adapter.ts` — reference for `tauri_invoke` pattern + `AiPort` implementation

---

## Implementation Order

1. **Types + Port** — `ai_stream_types.ts`, `AiStreamPort` in `ports.ts`
2. **AsyncQueue utility** — `async_queue.ts` (event → AsyncIterable bridge)
3. **Rust streaming** — `stream.rs` with `ai_stream_start` / `ai_stream_abort` commands, register in `app/mod.rs` and `tests/mod.rs`
4. **Stream Adapter** — `ai_stream_adapter.ts` wrapping Tauri events into `AsyncIterable`
5. **MarkdownJoiner** — `markdown_joiner.ts` + tests (pure domain logic, testable in isolation)
6. **Schema** — Add `ai_generated` mark to ProseMirror schema in `adapters/schema.ts`
7. **Plugin** — `ai_menu_plugin.ts` with keymap, state, decorations
8. **Menu UI** — `ai_inline_menu.svelte` floating component
9. **Extension** — `ai_inline_extension.ts` wiring, add to `assemble_extensions()` in `extensions/index.ts`
10. **Service** — `stream_inline()` in `ai_service.ts` (add `AiStreamPort` dep, compose with MarkdownJoiner)
11. **Actions** — Add action IDs to `action_ids.ts`, register inline AI actions in `ai_actions.ts`
12. **DI** — Wire `AiStreamPort` in `app_ports.ts` + `create_app_context.ts`
13. **CSS** — AI highlight + animation styles in `src/styles/editor.css`
14. **Tests** — Plugin behavior + streaming adapter + MarkdownJoiner

---

## Verification

1. `pnpm check` — TypeScript/Svelte type checking passes
2. `pnpm lint` — Layering lint passes (stream adapter is in adapters/, service doesn't import it directly)
3. `pnpm test` — All existing + new tests pass
4. `cd src-tauri && cargo check` — Rust compiles with new streaming commands
5. Manual: Open editor → Cmd+J → see floating menu → type prompt → observe streaming text insertion with highlight → accept/reject works
