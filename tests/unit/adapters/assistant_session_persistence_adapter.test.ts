import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { create_assistant_session_persistence_tauri_adapter } =
  await import("$lib/features/assistant/adapters/assistant_session_persistence_tauri_adapter");
import type { AssistantSession } from "$lib/features/assistant";

const INDEX_PATH = ".carbide/assistant/index.json";
const LEGACY_INDEX_PATH = ".carbide/rag/index.json";

function session(overrides: Partial<AssistantSession> = {}): AssistantSession {
  return {
    id: "s1",
    kind: "chat",
    title: "First chat",
    title_source: "derived",
    origin: {},
    created_at: 1,
    updated_at: 2,
    messages: [{ id: "m1", role: "user", content: "hi", citations: [] }],
    provider_id: "ollama",
    scope: {},
    mode: "ask",
    permission_mode: "safe",
    changed_files: [],
    ...overrides,
  };
}

type WrittenFiles = Map<string, string>;

function fake_vault(): WrittenFiles {
  const files: WrittenFiles = new Map();
  invoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
    const path = args.relativePath as string;
    if (cmd === "read_vault_file") {
      const content = files.get(path);
      if (content === undefined) return Promise.reject(new Error("not found"));
      return Promise.resolve(content);
    }
    if (cmd === "write_vault_file") {
      files.set(path, args.content as string);
      return Promise.resolve();
    }
    if (cmd === "delete_vault_file") {
      files.delete(path);
      return Promise.resolve();
    }
    return Promise.reject(new Error(`unexpected command: ${cmd}`));
  });
  return files;
}

function read_index(files: WrittenFiles, path = INDEX_PATH): unknown[] {
  return JSON.parse(files.get(path) ?? "[]") as unknown[];
}

describe("assistant_session_persistence_tauri_adapter", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("saves a session to a per-session file under .carbide/assistant and indexes it", async () => {
    const files = fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();

    await adapter.save_session("v1", session());

    expect(files.has(".carbide/assistant/sessions/s1.json")).toBe(true);
    expect(await adapter.load_session("v1", "s1")).toEqual(session());
    expect(await adapter.list_sessions("v1")).toEqual([
      {
        id: "s1",
        kind: "chat",
        title: "First chat",
        created_at: 1,
        updated_at: 2,
      },
    ]);
  });

  it("lists sessions newest-first and upserts on re-save", async () => {
    fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();

    await adapter.save_session("v1", session({ id: "a", updated_at: 10 }));
    await adapter.save_session("v1", session({ id: "b", updated_at: 20 }));
    await adapter.save_session(
      "v1",
      session({ id: "a", title: "renamed", updated_at: 30 }),
    );

    const summaries = await adapter.list_sessions("v1");
    expect(summaries.map((s) => s.id)).toEqual(["a", "b"]);
    expect(summaries[0]?.title).toBe("renamed");
  });

  it("deletes a session from the index and removes its file", async () => {
    const files = fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();

    await adapter.save_session("v1", session({ id: "a" }));
    await adapter.save_session("v1", session({ id: "b" }));

    await adapter.delete_session("v1", "a");

    expect((await adapter.list_sessions("v1")).map((s) => s.id)).toEqual(["b"]);
    expect(files.has(".carbide/assistant/sessions/a.json")).toBe(false);
  });

  it("still drops the index entry when the session file is already gone", async () => {
    const files = fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();
    await adapter.save_session("v1", session({ id: "a" }));
    files.delete(".carbide/assistant/sessions/a.json");

    await expect(adapter.delete_session("v1", "a")).resolves.toBeUndefined();
    expect(await adapter.list_sessions("v1")).toEqual([]);
  });

  it("returns an empty list and null when nothing is persisted", async () => {
    fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();

    expect(await adapter.list_sessions("v1")).toEqual([]);
    expect(await adapter.load_session("v1", "missing")).toBeNull();
  });

  it("propagates write failures so callers can fail soft", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "write_vault_file") {
        return Promise.reject(
          new Error("cannot write to .carbide/ in browse mode"),
        );
      }
      return Promise.reject(new Error("not found"));
    });
    const adapter = create_assistant_session_persistence_tauri_adapter();

    await expect(adapter.save_session("v1", session())).rejects.toThrow(
      /browse mode/,
    );
  });

  it("rejects a session id that would escape the sessions directory", async () => {
    fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();

    await expect(
      adapter.load_session("v1", "../../etc/passwd"),
    ).rejects.toThrow(/Invalid assistant session id/);
    await expect(
      adapter.save_session("v1", session({ id: "../escape" })),
    ).rejects.toThrow(/Invalid assistant session id/);
  });

  it("round-trips inline and note sessions, not just chats", async () => {
    fake_vault();
    const adapter = create_assistant_session_persistence_tauri_adapter();
    const inline = session({ id: "inline1", kind: "inline", updated_at: 5 });
    const note = session({
      id: "note1",
      kind: "note",
      origin: { note_path: "notes/a.md" },
      updated_at: 6,
    });

    await adapter.save_session("v1", inline);
    await adapter.save_session("v1", note);

    expect(await adapter.load_session("v1", "inline1")).toEqual(inline);
    expect(await adapter.load_session("v1", "note1")).toEqual(note);
    expect((await adapter.list_sessions("v1")).map((s) => s.kind)).toEqual([
      "note",
      "inline",
    ]);
  });

  describe("pre-C1 sessions under rag/", () => {
    function seed_legacy(files: WrittenFiles) {
      files.set(
        LEGACY_INDEX_PATH,
        JSON.stringify([
          { id: "old", title: "Old chat", created_at: 1, updated_at: 4 },
        ]),
      );
      files.set(
        ".carbide/rag/sessions/old.json",
        JSON.stringify(
          session({ id: "old", title: "Old chat", updated_at: 4 }),
        ),
      );
    }

    it("hydrates legacy sessions and stamps a missing kind as chat", async () => {
      const files = fake_vault();
      seed_legacy(files);
      const adapter = create_assistant_session_persistence_tauri_adapter();

      expect(await adapter.list_sessions("v1")).toEqual([
        {
          id: "old",
          kind: "chat",
          title: "Old chat",
          created_at: 1,
          updated_at: 4,
        },
      ]);
      expect(await adapter.load_session("v1", "old")).toMatchObject({
        id: "old",
        title: "Old chat",
      });
    });

    it("carries every legacy entry into the new index, kind-stamped, when one new session is saved", async () => {
      const files = fake_vault();
      seed_legacy(files);
      const adapter = create_assistant_session_persistence_tauri_adapter();

      await adapter.save_session("v1", session({ id: "new", updated_at: 9 }));

      expect(read_index(files)).toEqual([
        {
          id: "new",
          kind: "chat",
          title: "First chat",
          created_at: 1,
          updated_at: 9,
        },
        {
          id: "old",
          kind: "chat",
          title: "Old chat",
          created_at: 1,
          updated_at: 4,
        },
      ]);
    });

    it("prefers the new index once it exists and leaves legacy files in place", async () => {
      const files = fake_vault();
      seed_legacy(files);
      const adapter = create_assistant_session_persistence_tauri_adapter();

      await adapter.save_session("v1", session({ id: "new", updated_at: 9 }));

      expect(files.has(LEGACY_INDEX_PATH)).toBe(true);
      expect(files.has(".carbide/rag/sessions/old.json")).toBe(true);
      expect((await adapter.list_sessions("v1")).map((s) => s.id)).toEqual([
        "new",
        "old",
      ]);
    });
  });
});
