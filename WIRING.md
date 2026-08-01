# AU-004 wiring — assistant transport adapter

Nothing below is applied in this lane. AU-004 touched no `index.ts`, no
`create_app_context.ts`, and no action registry.

## 1. Barrel export

`src/lib/features/assistant/index.ts` — add alongside the existing exports:

```ts
export { create_assistant_transport_tauri_adapter } from "$lib/features/assistant/adapters/assistant_transport_tauri_adapter";
```

Factory signature:

```ts
function create_assistant_transport_tauri_adapter(): AssistantTransportPort;
```

No arguments, no construction-time side effects, no state held between calls —
every `stream()` mints its own request id, queue, and listener. It can be
constructed once at app start and shared by every surface.

## 2. DI construction site

`src/lib/app/create_app_context.ts` (or wherever `AssistantKernelService` is
constructed — AU-003 owns the kernel). Construct the adapter next to the other
Tauri adapters and pass it as the kernel's `transport` dep:

```ts
const assistant_transport = create_assistant_transport_tauri_adapter();

const assistant_kernel = new AssistantKernelService({
  transport: assistant_transport,
  // ...remaining AssistantKernelDeps (probe, store, ...) from AU-003
});
```

Ordering constraint: none beyond "before the kernel". The adapter has no
dependency on vault state, settings, or the provider registry — the provider
config and vault path arrive per call on `TransportRequest`.

Non-Tauri (browser/dev) contexts: `tauri_invoke` throws outside Tauri, which the
adapter surfaces as a single `{ type: "error", message }` event. If a
browser-only context is wired, substitute the mock transport from
`tests/unit/helpers/assistant_fixtures.ts` rather than this adapter.

## 3. Retirement note for AU-002

`create_ai_stream_adapter` (`features/ai/adapters/ai_stream_adapter.ts`) and
`create_agent_tauri_adapter` (`features/rag/adapters/agent_tauri_adapter.ts`)
are both fully subsumed by this adapter and can be deleted once their callers
move to the kernel. Both files are left untouched by this lane.

Two behavioral notes for whoever migrates callers:

- `AgentStreamRequest.vault_path` was a required `string`; the frozen
  `TransportRequest.vault_path` is `string | null` and is passed straight into
  `spec.vault_path`. If the Rust `agent_run_start` handler rejects a null vault
  path, that null now reaches it where it previously could not.
- Agent `tool_end.result_summary` is normalized to `null` when the wire payload
  omits it (`exactOptionalPropertyTypes` forbids passing `undefined` into
  `RunEvent`'s optional `result_summary`). Consumers that distinguished
  "absent" from "null" would need updating; none currently do.
