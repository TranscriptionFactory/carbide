import type { AssistantToolEvent } from "$lib/features/assistant/types/session";

export type ToolFinish = {
  name: string;
  ok: boolean;
  result_summary?: string | null | undefined;
};

// Last-open-by-name: a tool_end carries no id yet, so it settles the most
// recent unfinished event with the same name. Copy-on-write so store patches
// see a fresh array.
export function finish_tool_event(
  events: AssistantToolEvent[],
  finish: ToolFinish,
): AssistantToolEvent[] {
  const next = [...events];
  for (let index = next.length - 1; index >= 0; index -= 1) {
    const event = next[index];
    if (event && event.name === finish.name && event.ok === undefined) {
      next[index] = {
        ...event,
        ok: finish.ok,
        ...(finish.result_summary != null
          ? { result_summary: finish.result_summary }
          : {}),
      };
      break;
    }
  }
  return next;
}
