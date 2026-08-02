import type {
  AssistantMessage,
  AssistantSession,
} from "$lib/features/assistant";

// C1 shared fixtures (E1). UI lanes render sessions from these via props —
// the store's mutators are AU-010's and stay NOT_IMPLEMENTED until it lands,
// so nothing in a UI lane may depend on them.

let next_message = 0;

export function make_session_message(
  overrides: Partial<AssistantMessage> = {},
): AssistantMessage {
  next_message += 1;
  return {
    id: `message-${String(next_message)}`,
    role: "user",
    content: "How do backlinks work?",
    citations: [],
    ...overrides,
  };
}

export function make_session(
  overrides: Partial<AssistantSession> = {},
): AssistantSession {
  return {
    id: "session-1",
    kind: "chat",
    title: "How do backlinks work?",
    title_source: "derived",
    created_at: 1_700_000_000_000,
    updated_at: 1_700_000_000_000,
    provider_id: "claude",
    messages: [],
    origin: {},
    scope: {},
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}
