import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { RunSink } from "$lib/features/assistant/types/run";

// R8 retarget spec (C1 contract). One kernel-registered sink lands run events
// on the run's origin session:
//
//   - association comes from RunRecord.origin.session_id (via `runs`), never
//     from a side table; a run with no session_id is not this sink's business.
//   - `text`/`reasoning` stream into the session's trailing assistant message
//     (update_message), creating it on first delivery.
//   - `tool_start`/`tool_end` append to that message's tool_events.
//   - the `end` outcome closes the message out; an aborted run must leave the
//     transcript coherent and marked, never half-open (contract item a).
//
// AU-010 implements; `agent_runner` and the surfaces are never edited to make
// this happen — that is the point of R8.
export function create_session_run_sink(_deps: {
  runs: AssistantRunStore;
  sessions: AssistantSessionStore;
}): RunSink {
  throw new Error("NOT_IMPLEMENTED: AU-010 implements the session run sink");
}
