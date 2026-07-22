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

  it("preserves agent fields on already-migrated sessions", () => {
    const session: RagSession = {
      ...stored_session(),
      mode: "agent",
      permission_mode: "power",
      changed_files: ["notes/a.md"],
      agent_session_id: "sess-1",
    };

    const migrated = migrate_agent_fields(session);

    expect(migrated).toEqual(session);
  });
});
