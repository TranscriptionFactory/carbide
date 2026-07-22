import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { create_rag_persistence_tauri_adapter } =
  await import("$lib/features/rag/adapters/rag_persistence_tauri_adapter");
import type { RagSession } from "$lib/features/rag/domain/rag_types";

function session(overrides: Partial<RagSession> = {}): RagSession {
  return {
    id: "s1",
    title: "First chat",
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

describe("rag_persistence_tauri_adapter", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("saves a session to a per-session file and indexes it", async () => {
    fake_vault();
    const adapter = create_rag_persistence_tauri_adapter();

    await adapter.save_session("v1", session());

    const loaded = await adapter.load_session("v1", "s1");
    expect(loaded).toEqual(session());

    const summaries = await adapter.list_sessions("v1");
    expect(summaries).toEqual([
      { id: "s1", title: "First chat", created_at: 1, updated_at: 2 },
    ]);
  });

  it("lists sessions newest-first and upserts on re-save", async () => {
    fake_vault();
    const adapter = create_rag_persistence_tauri_adapter();

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
    const adapter = create_rag_persistence_tauri_adapter();

    await adapter.save_session("v1", session({ id: "a" }));
    await adapter.save_session("v1", session({ id: "b" }));

    await adapter.delete_session("v1", "a");

    const summaries = await adapter.list_sessions("v1");
    expect(summaries.map((s) => s.id)).toEqual(["b"]);
    expect(files.has(".carbide/rag/sessions/a.json")).toBe(false);
  });

  it("returns an empty list and null when nothing is persisted", async () => {
    fake_vault();
    const adapter = create_rag_persistence_tauri_adapter();

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
    const adapter = create_rag_persistence_tauri_adapter();

    await expect(adapter.save_session("v1", session())).rejects.toThrow(
      /browse mode/,
    );
  });
});
