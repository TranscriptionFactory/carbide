import type {
  AssistantToolEvent,
  AssistantToolPermission,
} from "$lib/features/assistant/types/session";
import type {
  PermissionOptionSpec,
  ToolContent,
  ToolKind,
} from "$lib/features/assistant/types/agent_events";

export type ToolEventStatus = "running" | "completed" | "failed";

export function tool_event_status(event: AssistantToolEvent): ToolEventStatus {
  if (event.ok === undefined) return "running";
  return event.ok ? "completed" : "failed";
}

export function tool_event_has_body(event: AssistantToolEvent): boolean {
  return (
    Boolean(event.result_summary) ||
    (event.paths?.length ?? 0) > 0 ||
    (event.content?.length ?? 0) > 0 ||
    (event.locations?.length ?? 0) > 0
  );
}

// Caps applied at fold time so persistence inherits them: the session file is
// bounded by what the fold keeps, not by what the wire carried.
const TEXT_BLOCK_CAP = 8_000;
const EXECUTE_OUTPUT_CAP = 32_000;
const DIFF_CHAR_CAP = 200_000;
export const TRUNCATED_MARKER = "… output trimmed …";

function cap_text(text: string, kind: ToolKind | undefined): string {
  if (kind === "execute") {
    // Terminal output: the tail is where the outcome lives.
    if (text.length <= EXECUTE_OUTPUT_CAP) return text;
    return `${TRUNCATED_MARKER}\n${text.slice(-EXECUTE_OUTPUT_CAP)}`;
  }
  if (text.length <= TEXT_BLOCK_CAP) return text;
  return `${text.slice(0, TEXT_BLOCK_CAP)}\n${TRUNCATED_MARKER}`;
}

export function cap_tool_content(
  content: ToolContent[],
  kind: ToolKind | undefined,
): ToolContent[] {
  return content.map((block) => {
    if (block.kind === "text") {
      const text = cap_text(block.text, kind);
      return text === block.text ? block : { ...block, text };
    }
    const size = (block.old_text?.length ?? 0) + block.new_text.length;
    if (size <= DIFF_CHAR_CAP) return block;
    return {
      kind: "text" as const,
      text: `Diff for ${block.path} too large to display (${String(size)} chars).`,
    };
  });
}

// Every fold that patches one event walks backwards to the newest match and
// copies only on a hit — a miss returns null so callers never patch stores for
// a no-op.
function replace_last_where(
  events: AssistantToolEvent[],
  predicate: (event: AssistantToolEvent) => boolean,
  replace: (event: AssistantToolEvent) => AssistantToolEvent,
): AssistantToolEvent[] | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || !predicate(event)) continue;
    const next = [...events];
    next[index] = replace(event);
    return next;
  }
  return null;
}

export type ToolUpdatePatch = {
  id: string;
  content?: ToolContent[];
  paths?: string[];
};

// Mid-call update: replace content with the latest capped snapshot (ACP
// updates carry the full content list, not deltas) and merge paths as a union.
export function apply_tool_update(
  events: AssistantToolEvent[],
  update: ToolUpdatePatch,
): AssistantToolEvent[] {
  return (
    replace_last_where(
      events,
      (event) => event.id === update.id,
      (event) => ({
        ...event,
        ...(update.content && update.content.length > 0
          ? { content: cap_tool_content(update.content, event.kind) }
          : {}),
        ...(update.paths && update.paths.length > 0
          ? { paths: merge_paths(event.paths, update.paths) }
          : {}),
      }),
    ) ?? events
  );
}

export function merge_paths(
  existing: string[] | undefined,
  incoming: string[],
): string[] {
  const merged = [...(existing ?? [])];
  for (const path of incoming) {
    if (!merged.includes(path)) merged.push(path);
  }
  return merged;
}

// Nullish members are stripped before merging, so wire-level "no value"
// (null or undefined) never lands on the stored event as an explicit null.
export type ToolEventPatch = {
  [K in keyof AssistantToolEvent]?: AssistantToolEvent[K] | null | undefined;
};

export type ToolEventRef = { id?: string | null; name: string };

function find_open_event(
  events: AssistantToolEvent[],
  ref: ToolEventRef,
): number {
  // Id-first; last-open-by-name is the fallback for producers that don't
  // carry ids (pre-ACP transcripts, degenerate parsers).
  if (ref.id) {
    for (let index = events.length - 1; index >= 0; index -= 1) {
      const event = events[index];
      if (event && event.id === ref.id && event.ok === undefined) return index;
    }
  }
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event && event.name === ref.name && event.ok === undefined)
      return index;
  }
  return -1;
}

export type PermissionRequestPatch = {
  request_id: string;
  tool_call_id?: string | null | undefined;
  name: string;
  kind: ToolKind;
  input_summary: string;
  paths: string[];
  options: PermissionOptionSpec[];
};

// Attaches a prompt to the tool event it gates. A request can outrun its
// tool_start, so a miss inserts a placeholder event the later tool_start
// hydrates in place — either arrival order works.
export function apply_permission_request(
  events: AssistantToolEvent[],
  request: PermissionRequestPatch,
): AssistantToolEvent[] {
  const permission: AssistantToolPermission = {
    request_id: request.request_id,
    options: request.options,
  };
  if (request.tool_call_id) {
    const attached = replace_last_where(
      events,
      (event) => event.id === request.tool_call_id,
      (event) => ({ ...event, permission }),
    );
    if (attached) return attached;
  }
  return [
    ...events,
    {
      ...(request.tool_call_id ? { id: request.tool_call_id } : {}),
      name: request.name,
      kind: request.kind,
      input_summary: request.input_summary,
      paths: request.paths,
      permission,
    },
  ];
}

// A tool_start whose id matches a permission placeholder fills it in rather
// than appending a duplicate row.
export function hydrate_placeholder(
  events: AssistantToolEvent[],
  start: AssistantToolEvent,
): AssistantToolEvent[] | null {
  if (!start.id) return null;
  return replace_last_where(
    events,
    (event) => event.id === start.id && event.permission !== undefined,
    (event) => ({
      ...start,
      ...(event.permission ? { permission: event.permission } : {}),
    }),
  );
}

export function apply_permission_resolved(
  events: AssistantToolEvent[],
  request_id: string,
  outcome: string,
  auto: boolean,
): AssistantToolEvent[] {
  return (
    replace_last_where(
      events,
      (event) => event.permission?.request_id === request_id,
      (event) => ({
        ...event,
        ...(event.permission
          ? { permission: { ...event.permission, resolved: { outcome, auto } } }
          : {}),
      }),
    ) ?? events
  );
}

// A stopped run must not leave a live prompt: every unresolved permission is
// marked dismissed when the run closes out, on both sinks.
export function dismiss_open_permissions(
  events: AssistantToolEvent[],
): AssistantToolEvent[] {
  if (!events.some((event) => event.permission && !event.permission.resolved)) {
    return events;
  }
  return events.map((event) =>
    event.permission && !event.permission.resolved
      ? {
          ...event,
          permission: {
            ...event.permission,
            resolved: { outcome: "cancelled", auto: true },
          },
        }
      : event,
  );
}

// Settles the open event the ref points at, merging whatever fields the
// finish carried. Paths merge as a union — a diff surfaced only mid-call must
// stay visible on the settled event. Copies only when something actually
// settles; a miss returns the input so callers don't patch stores for no-ops.
export function finish_tool_event(
  events: AssistantToolEvent[],
  ref: ToolEventRef,
  patch: ToolEventPatch,
): AssistantToolEvent[] {
  const index = find_open_event(events, ref);
  if (index < 0) return events;
  const event = events[index];
  if (!event) return events;

  const settled = { ...event };
  for (const [key, value] of Object.entries(patch)) {
    if (value != null && key !== "paths") {
      (settled as Record<string, unknown>)[key] = value;
    }
  }
  if (patch.paths && patch.paths.length > 0) {
    settled.paths = merge_paths(event.paths, patch.paths);
  }
  const next = [...events];
  next[index] = settled;
  return next;
}
