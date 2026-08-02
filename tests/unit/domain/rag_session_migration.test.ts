import { describe, expect, it } from "vitest";
import { migrate_agent_fields } from "$lib/features/rag";
import type { RagSession } from "$lib/features/rag";
import type { StoredRagSession } from "$lib/features/rag/types/rag_session";

function stored_session(
  overrides: Partial<StoredRagSession> = {},
): StoredRagSession {
  return {
    id: "s1",
    title: "Old chat",
    created_at: 1,
    updated_at: 2,
    messages: [],
    provider_id: "claude",
    scope: {},
    ...overrides,
  };
}

describe("migrate_agent_fields", () => {
  it("defaults agent fields for sessions persisted before agent mode", () => {
    const migrated = migrate_agent_fields(stored_session());

    expect(migrated.mode).toBe("ask");
    expect(migrated.permission_mode).toBe("safe");
    expect(migrated.changed_files).toEqual([]);
    expect(migrated.agent_session_id).toBeUndefined();
  });

  // Chats are the only kind rag ever persisted, so a file written before the
  // session model was shared has to be named as one on the way in.
  it("completes the session-model fields a rag-era file never stored", () => {
    const migrated = migrate_agent_fields(stored_session());

    expect(migrated.kind).toBe("chat");
    expect(migrated.title_source).toBe("derived");
    expect(migrated.origin).toEqual({});
  });

  it("keeps a title the user set rather than reopening it to autotitling", () => {
    const migrated = migrate_agent_fields(
      stored_session({ title_source: "manual" }),
    );

    expect(migrated.title_source).toBe("manual");
  });

  it("preserves agent fields on already-migrated sessions", () => {
    const session: RagSession = {
      ...stored_session(),
      kind: "chat",
      title_source: "derived",
      origin: {},
      mode: "agent",
      permission_mode: "power",
      changed_files: ["notes/a.md"],
      agent_session_id: "sess-1",
    };

    const migrated = migrate_agent_fields(session);

    expect(migrated).toEqual(session);
  });

  it("preserves tool-call and tool-result messages", () => {
    const session: RagSession = {
      ...stored_session(),
      kind: "chat",
      title_source: "derived",
      origin: {},
      mode: "agent",
      permission_mode: "power",
      changed_files: [],
      messages: [
        { id: "m1", role: "user", content: "create a note", citations: [] },
        {
          id: "m2",
          role: "assistant",
          content: "",
          citations: [],
          tool_calls: [
            {
              id: "call_1",
              name: "create_note",
              arguments: '{"path":"notes/a.md"}',
            },
          ],
        },
        {
          id: "m3",
          role: "tool",
          content: "Created notes/a.md",
          citations: [],
          tool_call_id: "call_1",
        },
        { id: "m4", role: "assistant", content: "Done.", citations: [] },
      ],
    };

    const migrated = migrate_agent_fields(session);

    expect(migrated).toEqual(session);
  });

  it("leaves messages without tool fields unchanged", () => {
    const stored = stored_session({
      messages: [
        { id: "m1", role: "user", content: "what is X?", citations: [] },
        { id: "m2", role: "assistant", content: "X is Y.", citations: [] },
      ],
    });

    const migrated = migrate_agent_fields(stored);

    expect(migrated.messages).toEqual(stored.messages);
    expect(migrated.messages[1]?.tool_calls).toBeUndefined();
    expect(migrated.messages[1]?.tool_call_id).toBeUndefined();
  });
});
