import type { AssistantToolEvent } from "$lib/features/assistant/types/session";

export type ToolEventStatus = "running" | "completed" | "failed";

export function tool_event_status(event: AssistantToolEvent): ToolEventStatus {
  if (event.ok === undefined) return "running";
  return event.ok ? "completed" : "failed";
}

export function tool_event_has_body(event: AssistantToolEvent): boolean {
  return Boolean(event.result_summary) || (event.paths?.length ?? 0) > 0;
}

// Nullish members are stripped before merging, so wire-level "no value"
// (null or undefined) never lands on the stored event as an explicit null.
export type ToolEventPatch = {
  [K in keyof AssistantToolEvent]?: AssistantToolEvent[K] | null | undefined;
};

// Last-open-by-name: a tool_end carries no id yet, so it settles the most
// recent unfinished event with the same name, merging whatever fields the
// finish carried. Copies only when something actually settles; a miss returns
// the input so callers don't trigger a store patch for a no-op.
export function finish_tool_event(
  events: AssistantToolEvent[],
  name: string,
  patch: ToolEventPatch,
): AssistantToolEvent[] {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && event.name === name && event.ok === undefined) {
      const settled = { ...event };
      for (const [key, value] of Object.entries(patch)) {
        if (value != null) {
          (settled as Record<string, unknown>)[key] = value;
        }
      }
      const next = [...events];
      next[index] = settled;
      return next;
    }
  }
  return events;
}
