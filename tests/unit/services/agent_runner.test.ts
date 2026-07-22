import { describe, expect, it, vi } from "vitest";
import { AgentRunner, RagStore } from "$lib/features/rag";
import type {
  AgentEvent,
  AgentPort,
  AgentStreamRequest,
} from "$lib/features/rag";
import { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { create_test_vault } from "../helpers/test_fixtures";

const provider: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: ["-p"] },
};

function make_stores() {
  const rag_store = new RagStore();
  rag_store.set_mode("agent");
  rag_store.add_user_message("organize my notes");
  const vault_store = new VaultStore();
  vault_store.set_vault(create_test_vault());
  return { rag_store, vault_store };
}

function make_harness(events: AgentEvent[]) {
  const { rag_store, vault_store } = make_stores();
  const calls: string[] = [];
  const captured: AgentStreamRequest[] = [];
  const port: AgentPort = {
    stream_turn: (input) => {
      calls.push("stream");
      captured.push(input);
      // eslint-disable-next-line @typescript-eslint/require-await
      return (async function* () {
        for (const event of events) yield event;
      })();
    },
  };
  const git = {
    create_checkpoint: vi.fn((_description: string) => {
      calls.push("checkpoint");
      return Promise.resolve({ status: "created" as const });
    }),
  };
  const refresh_vault = vi.fn();
  const runner = new AgentRunner(
    port,
    rag_store,
    vault_store,
    git,
    refresh_vault,
  );
  return { runner, rag_store, calls, captured, git, refresh_vault };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgentRunner.run_turn", () => {
  it("populates changed files from mutating tool events and refreshes the vault", async () => {
    const { runner, rag_store, refresh_vault } = make_harness([
      { type: "init", session_id: "sess-1" },
      {
        type: "tool_start",
        name: "mcp__carbide__read_note",
        input_summary: '{"path":"notes/a.md"}',
      },
      { type: "tool_end", name: "mcp__carbide__read_note", ok: true },
      {
        type: "tool_start",
        name: "mcp__carbide__update_note",
        input_summary: '{"path":"notes/a.md"}',
      },
      { type: "tool_end", name: "mcp__carbide__update_note", ok: true },
      {
        type: "tool_start",
        name: "Write",
        input_summary: '{"file_path":"notes/b.md"}',
      },
      { type: "tool_end", name: "Write", ok: true },
      { type: "text", delta: "Done." },
      { type: "done", stats: {} },
    ]);

    const result = await runner.run_turn(provider, "organize my notes");

    expect(result).toEqual({ status: "done" });
    const session = rag_store.active;
    expect(session?.changed_files).toEqual(["notes/a.md", "notes/b.md"]);
    expect(session?.agent_session_id).toBe("sess-1");
    expect(refresh_vault).toHaveBeenCalledTimes(1);
    const assistant = session?.messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.content).toBe("Done.");
    expect(assistant?.tool_events).toHaveLength(3);
    expect(assistant?.tool_events?.every((e) => e.ok === true)).toBe(true);
    expect(rag_store.streaming_id).toBeNull();
  });

  it("does not refresh the vault when no mutating tools ran", async () => {
    const { runner, rag_store, refresh_vault } = make_harness([
      { type: "init", session_id: "sess-1" },
      { type: "text", delta: "Nothing to change." },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "just look around");

    expect(refresh_vault).not.toHaveBeenCalled();
    expect(rag_store.active?.changed_files).toEqual([]);
  });

  it("creates a git checkpoint before starting the stream", async () => {
    const { runner, calls, git } = make_harness([
      { type: "text", delta: "ok" },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes");

    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["checkpoint", "stream"]);
  });

  it("passes the captured agent session id as resume id on the next turn", async () => {
    const { runner, captured } = make_harness([
      { type: "init", session_id: "sess-1" },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "first turn");
    await runner.run_turn(provider, "second turn");

    expect(captured[0]?.resume_session_id).toBeUndefined();
    expect(captured[1]?.resume_session_id).toBe("sess-1");
    expect(captured[0]?.permission_mode).toBe("safe");
    expect(captured[0]?.vault_path).toBe("/test/vault");
  });

  it("abort mid-run keeps the partial transcript and returns to idle", async () => {
    const { rag_store, vault_store } = make_stores();
    const aborted = { observed: false };
    const port: AgentPort = {
      stream_turn: (input) => {
        const signal = input.signal;
        return (async function* () {
          yield { type: "text", delta: "partial " } as AgentEvent;
          yield { type: "text", delta: "answer" } as AgentEvent;
          await new Promise<void>((resolve) => {
            const on_abort = () => {
              aborted.observed = true;
              resolve();
            };
            if (signal?.aborted) {
              on_abort();
              return;
            }
            signal?.addEventListener("abort", on_abort, { once: true });
          });
        })();
      },
    };
    const git = {
      create_checkpoint: vi
        .fn()
        .mockResolvedValue({ status: "created" as const }),
    };
    const refresh_vault = vi.fn();
    const runner = new AgentRunner(
      port,
      rag_store,
      vault_store,
      git,
      refresh_vault,
    );

    const running = runner.run_turn(provider, "organize my notes");
    await tick();
    expect(runner.is_running).toBe(true);
    runner.abort();
    const result = await running;

    expect(result).toEqual({ status: "done" });
    expect(aborted.observed).toBe(true);
    expect(runner.is_running).toBe(false);
    expect(rag_store.streaming_id).toBeNull();
    expect(rag_store.is_loading).toBe(false);
    expect(rag_store.error).toBeNull();
    const assistant = rag_store.active?.messages.at(-1);
    expect(assistant?.content).toBe("partial answer");
  });

  it("surfaces stream errors and keeps the partial answer", async () => {
    const { runner, rag_store } = make_harness([
      { type: "text", delta: "half" },
      { type: "error", message: "CLI crashed" },
    ]);

    const result = await runner.run_turn(provider, "organize my notes");

    expect(result).toEqual({ status: "error", message: "CLI crashed" });
    expect(rag_store.error).toBe("CLI crashed");
    expect(rag_store.active?.messages.at(-1)?.content).toBe("half");
  });
});
