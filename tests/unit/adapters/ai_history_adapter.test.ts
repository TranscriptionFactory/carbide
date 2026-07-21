import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

const { create_ai_history_tauri_adapter, AI_HISTORY_TURN_CAP } = await import(
  "$lib/features/ai/adapters/ai_history_tauri_adapter"
);
import type { AiConversationTurn } from "$lib/features/ai/domain/ai_types";

function turn(id: number): AiConversationTurn {
  return {
    id,
    provider_id: "claude",
    target: "full_note",
    mode: "ask",
    prompt: `question ${id}`,
    status: "completed",
    result: { success: true, output: `answer ${id}`, error: null },
  };
}

function fake_vault(): Map<string, string> {
  const files = new Map<string, string>();
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
    return Promise.reject(new Error(`unexpected command: ${cmd}`));
  });
  return files;
}

describe("ai_history_tauri_adapter", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("round-trips saved turns", async () => {
    fake_vault();
    const adapter = create_ai_history_tauri_adapter();

    await adapter.save_history("v1", [turn(1), turn(2)]);

    expect(await adapter.load_history("v1")).toEqual([turn(1), turn(2)]);
  });

  it("stores history under .carbide/ai/history.json", async () => {
    const files = fake_vault();
    const adapter = create_ai_history_tauri_adapter();

    await adapter.save_history("v1", [turn(1)]);

    expect(files.has(".carbide/ai/history.json")).toBe(true);
  });

  it("returns an empty list when nothing is persisted", async () => {
    fake_vault();
    const adapter = create_ai_history_tauri_adapter();

    expect(await adapter.load_history("v1")).toEqual([]);
  });

  it("returns an empty list for malformed content", async () => {
    const files = fake_vault();
    files.set(".carbide/ai/history.json", "{not json");
    const adapter = create_ai_history_tauri_adapter();

    expect(await adapter.load_history("v1")).toEqual([]);
  });

  it("returns an empty list for non-array content", async () => {
    const files = fake_vault();
    files.set(".carbide/ai/history.json", JSON.stringify({ turns: [] }));
    const adapter = create_ai_history_tauri_adapter();

    expect(await adapter.load_history("v1")).toEqual([]);
  });

  it("caps saved history to the newest turns", async () => {
    fake_vault();
    const adapter = create_ai_history_tauri_adapter();
    const many = Array.from({ length: AI_HISTORY_TURN_CAP + 20 }, (_, i) =>
      turn(i + 1),
    );

    await adapter.save_history("v1", many);

    const loaded = await adapter.load_history("v1");
    expect(loaded).toHaveLength(AI_HISTORY_TURN_CAP);
    expect(loaded[0]?.id).toBe(21);
    expect(loaded.at(-1)?.id).toBe(AI_HISTORY_TURN_CAP + 20);
  });

  it("propagates write failures so callers can fail soft", async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "write_vault_file") {
        return Promise.reject(new Error("cannot write in browse mode"));
      }
      return Promise.reject(new Error("not found"));
    });
    const adapter = create_ai_history_tauri_adapter();

    await expect(adapter.save_history("v1", [turn(1)])).rejects.toThrow(
      /browse mode/,
    );
  });
});
