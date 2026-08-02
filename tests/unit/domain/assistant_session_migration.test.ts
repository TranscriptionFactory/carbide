import { describe, expect, it } from "vitest";
import { migrate_scope, migrate_session_fields } from "$lib/features/assistant";
import type {
  AssistantSession,
  StoredAssistantSession,
} from "$lib/features/assistant";

function stored_session(
  overrides: Partial<StoredAssistantSession> = {},
): StoredAssistantSession {
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

describe("migrate_session_fields", () => {
  it("defaults agent fields for sessions persisted before agent mode", () => {
    const migrated = migrate_session_fields(stored_session());

    expect(migrated.mode).toBe("ask");
    expect(migrated.permission_mode).toBe("safe");
    expect(migrated.changed_files).toEqual([]);
    expect(migrated.agent_session_id).toBeUndefined();
  });

  // Chats are the only kind rag ever persisted, so a file written before the
  // session model was shared has to be named as one on the way in.
  it("completes the session-model fields a rag-era file never stored", () => {
    const migrated = migrate_session_fields(stored_session());

    expect(migrated.kind).toBe("chat");
    expect(migrated.title_source).toBe("derived");
    expect(migrated.origin).toEqual({});
  });

  it("keeps a title the user set rather than reopening it to autotitling", () => {
    const migrated = migrate_session_fields(
      stored_session({ title_source: "manual" }),
    );

    expect(migrated.title_source).toBe("manual");
  });

  it("preserves agent fields on already-migrated sessions", () => {
    const session: AssistantSession = {
      ...stored_session(),
      kind: "chat",
      title_source: "derived",
      origin: {},
      mode: "agent",
      permission_mode: "power",
      changed_files: ["notes/a.md"],
      agent_session_id: "sess-1",
    };

    const migrated = migrate_session_fields(session);

    expect(migrated).toEqual(session);
  });

  it("preserves tool-call and tool-result messages", () => {
    const session: AssistantSession = {
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

    const migrated = migrate_session_fields(session);

    expect(migrated).toEqual(session);
  });

  it("leaves messages without tool fields unchanged", () => {
    const stored = stored_session({
      messages: [
        { id: "m1", role: "user", content: "what is X?", citations: [] },
        { id: "m2", role: "assistant", content: "X is Y.", citations: [] },
      ],
    });

    const migrated = migrate_session_fields(stored);

    expect(migrated.messages).toEqual(stored.messages);
    expect(migrated.messages[1]?.tool_calls).toBeUndefined();
    expect(migrated.messages[1]?.tool_call_id).toBeUndefined();
  });
});

describe("migrate_scope", () => {
  it("coerces legacy single-value folder and tag into arrays", () => {
    expect(migrate_scope({ folder: "projects", tag: "active" })).toEqual({
      folders: ["projects"],
      tags: ["active"],
    });
  });

  it("drops legacy empty values", () => {
    expect(migrate_scope({ folder: "", tag: "  " })).toEqual({});
    expect(migrate_scope({ folder: "projects", tag: "" })).toEqual({
      folders: ["projects"],
    });
  });

  it("passes array shapes through unchanged", () => {
    expect(
      migrate_scope({
        folders: ["a", "b"],
        tags: ["t"],
        bases: ["views/x.base"],
      }),
    ).toEqual({ folders: ["a", "b"], tags: ["t"], bases: ["views/x.base"] });
  });

  it("returns an empty scope for empty or invalid input", () => {
    expect(migrate_scope({})).toEqual({});
    expect(migrate_scope(null)).toEqual({});
    expect(migrate_scope(undefined)).toEqual({});
  });
});

// I8: C1 was the program's only persisted-format change, so AU-040b must move
// this boundary without becoming a second one. These three cover the failure
// the whole lane risks — a load path that still typechecks with the migration
// gone, because every migrated field is optional on StoredAssistantSession.
describe("the hydration boundary is load-bearing", () => {
  // A file written before any of the six fields existed. Not a synthetic
  // Partial<> — this is the literal shape a pre-C1 rag session file has on
  // disk, with all six absent at once.
  const legacy_file_on_disk = {
    id: "legacy-1",
    title: "Old chat",
    created_at: 1,
    updated_at: 2,
    provider_id: "claude",
    scope: {},
    messages: [
      { id: "m1", role: "user", content: "what is X?", citations: [] },
      { id: "m2", role: "assistant", content: "X is Y.", citations: [] },
    ],
  } as unknown as StoredAssistantSession;

  it("completes every one of the six migrated fields at once", () => {
    const migrated = migrate_session_fields(legacy_file_on_disk);

    expect(migrated.kind).toBe("chat");
    expect(migrated.title_source).toBe("derived");
    expect(migrated.origin).toEqual({});
    expect(migrated.mode).toBe("ask");
    expect(migrated.permission_mode).toBe("safe");
    expect(migrated.changed_files).toEqual([]);
  });

  // The regression this guards: without `kind`, of_kind("chat") matches
  // nothing, the chat list renders empty, and every gate stays green because
  // `kind` is optional on the stored shape.
  it("gives a legacy file the kind the chat list filters on", () => {
    const migrated = migrate_session_fields(legacy_file_on_disk);

    expect([migrated].filter((s) => s.kind === "chat")).toHaveLength(1);
  });

  // I8: the bytes on disk must not change shape because the module moved.
  // Migrating an already-complete session is the identity, so a save written
  // after this lane is byte-identical to one written before it.
  it("round-trips an already-complete session byte-identically", () => {
    const complete: AssistantSession = {
      ...stored_session(),
      kind: "chat",
      title_source: "manual",
      origin: { note_path: "notes/a.md" },
      mode: "agent",
      permission_mode: "power",
      changed_files: ["notes/a.md"],
      agent_session_id: "sess-1",
      scope: { folders: ["projects/"], tags: ["active"] },
    };

    const before = JSON.stringify(complete, null, 2);
    const after = JSON.stringify(
      migrate_session_fields({
        ...complete,
        scope: migrate_scope(complete.scope),
      }),
      null,
      2,
    );

    expect(after).toBe(before);
  });
});
