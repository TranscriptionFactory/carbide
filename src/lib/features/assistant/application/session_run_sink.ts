import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type {
  AssistantMessage,
  AssistantToolEvent,
} from "$lib/features/assistant/types/session";
import type { RunId, RunSink } from "$lib/features/assistant/types/run";

// A turn that ran tools or reasoned before it stopped is worth keeping even
// with no text: the trail is the only record of what the agent touched. One
// with nothing in it is an empty bubble.
function has_turn_evidence(message: AssistantMessage): boolean {
  return (
    message.content !== "" ||
    (message.tool_events?.length ?? 0) > 0 ||
    (message.reasoning ?? "") !== ""
  );
}

function mark_tool_finished(
  events: AssistantToolEvent[],
  name: string,
  ok: boolean,
): AssistantToolEvent[] {
  const next = [...events];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const event = next[index];
    if (event && event.name === name && event.ok === undefined) {
      next[index] = { ...event, ok };
      break;
    }
  }
  return next;
}

// R8 retarget: one kernel-registered sink lands run events on the run's origin
// session. Association comes from RunRecord.origin.session_id, never from a
// side table — which is also why this writes to the run's own session rather
// than to whichever one happens to be active.
export function create_session_run_sink(deps: {
  runs: AssistantRunStore;
  sessions: AssistantSessionStore;
}): RunSink {
  const streaming = new Map<RunId, string>();

  const session_of = (run_id: RunId): string | null => {
    const session_id = deps.runs.get(run_id)?.origin.session_id;
    if (!session_id) return null;
    return deps.sessions.get(session_id) ? session_id : null;
  };

  const message_in = (
    session_id: string,
    message_id: string,
  ): AssistantMessage | null =>
    deps.sessions
      .get(session_id)
      ?.messages.find((message) => message.id === message_id) ?? null;

  const open_message = (run_id: RunId, session_id: string): string => {
    const existing = streaming.get(run_id);
    if (existing) return existing;

    const message: AssistantMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      citations: [],
    };
    deps.sessions.append_message(session_id, message);
    streaming.set(run_id, message.id);
    return message.id;
  };

  const amend = (
    session_id: string,
    message_id: string,
    changes: (message: AssistantMessage) => Partial<AssistantMessage>,
  ): void => {
    const message = message_in(session_id, message_id);
    if (!message) return;
    deps.sessions.update_message(session_id, message_id, changes(message));
  };

  // Streaming content opens the turn; a late tool result or error never
  // conjures one, or a stray event leaves an empty bubble behind.
  const on_open = (
    run_id: RunId,
    session_id: string,
    changes: (message: AssistantMessage) => Partial<AssistantMessage>,
  ): void => {
    amend(session_id, open_message(run_id, session_id), changes);
  };

  const on_existing = (
    run_id: RunId,
    session_id: string,
    changes: (message: AssistantMessage) => Partial<AssistantMessage>,
  ): void => {
    const message_id = streaming.get(run_id);
    if (!message_id) return;
    amend(session_id, message_id, changes);
  };

  return {
    on_event(run_id, event) {
      const session_id = session_of(run_id);
      if (!session_id) return;

      switch (event.type) {
        case "session":
          deps.sessions.patch_session(session_id, {
            agent_session_id: event.provider_session_id,
          });
          return;
        case "text":
          on_open(run_id, session_id, (message) => ({
            content: message.content + event.text,
          }));
          return;
        case "reasoning":
          on_open(run_id, session_id, (message) => ({
            reasoning: (message.reasoning ?? "") + event.text,
          }));
          return;
        case "tool_start":
          on_open(run_id, session_id, (message) => ({
            tool_events: [
              ...(message.tool_events ?? []),
              {
                name: event.name,
                input_summary: event.input_summary,
                paths: event.paths,
              },
            ],
          }));
          return;
        case "tool_end":
          on_existing(run_id, session_id, (message) => ({
            tool_events: mark_tool_finished(
              message.tool_events ?? [],
              event.name,
              event.ok,
            ),
          }));
          return;
        case "error":
          on_existing(run_id, session_id, () => ({ error: event.message }));
          return;
        case "done":
          return;
      }
    },

    // The abort path dispatches no terminal event, so this is where a stopped
    // transcript gets closed out — coherent and marked, never half-open.
    on_end(run_id, outcome) {
      const message_id = streaming.get(run_id);
      streaming.delete(run_id);

      const session_id = session_of(run_id);
      if (!session_id || !message_id) return;

      const message = message_in(session_id, message_id);
      if (!message || outcome.status === "done") return;

      if (!has_turn_evidence(message)) {
        const session = deps.sessions.get(session_id);
        if (!session) return;
        deps.sessions.replace_messages(
          session_id,
          session.messages.filter((entry) => entry.id !== message_id),
        );
        return;
      }

      if (outcome.status === "aborted") {
        deps.sessions.update_message(session_id, message_id, { stopped: true });
        return;
      }
      deps.sessions.update_message(session_id, message_id, {
        error: outcome.error.message,
      });
    },
  };
}
