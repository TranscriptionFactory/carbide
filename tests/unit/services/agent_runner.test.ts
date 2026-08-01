import { describe, expect, it, vi } from "vitest";
import { AgentRunner, RagStore } from "$lib/features/rag";
import type { RunEvent, RunRequest, RunSpec } from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_run_starter } from "../../adapters/test_run_starter";

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

function agent_request(spec: RunSpec): Extract<RunRequest, { mode: "agent" }> {
  if (spec.request.mode !== "agent") {
    throw new Error("expected an agent-mode run");
  }
  return spec.request;
}

function make_harness(events: RunEvent[]) {
  const { rag_store, vault_store } = make_stores();
  const calls: string[] = [];
  const starter = create_test_run_starter((_spec) => {
    calls.push("stream");
    return events;
  });
  const git = {
    create_checkpoint: vi.fn((_description: string) => {
      calls.push("checkpoint");
      return Promise.resolve({ status: "created" as const });
    }),
  };
  const refresh_vault = vi.fn();
  const sync_changed_notes = vi.fn();
  const runner = new AgentRunner(
    starter,
    rag_store,
    vault_store,
    git,
    refresh_vault,
    sync_changed_notes,
  );
  return {
    runner,
    rag_store,
    calls,
    starter,
    git,
    refresh_vault,
    sync_changed_notes,
  };
}

function tool_start(
  name: string,
  input_summary: string,
  extra: { paths?: string[]; mutating?: boolean } = {},
): RunEvent {
  return {
    type: "tool_start",
    name,
    input_summary,
    paths: extra.paths ?? [],
    mutating: extra.mutating ?? false,
  };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgentRunner.run_turn", () => {
  it("populates changed files from mutating tool events and refreshes the vault", async () => {
    const { runner, rag_store, refresh_vault, sync_changed_notes } =
      make_harness([
        { type: "session", provider_session_id: "sess-1" },
        tool_start("mcp__carbide__read_note", '{"path":"notes/a.md"}', {
          paths: ["notes/a.md"],
        }),
        { type: "tool_end", name: "mcp__carbide__read_note", ok: true },
        tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
          paths: ["notes/a.md"],
          mutating: true,
        }),
        { type: "tool_end", name: "mcp__carbide__update_note", ok: true },
        tool_start("Write", '{"content":"…truncated', {
          paths: ["/test/vault/notes/b.md"],
          mutating: true,
        }),
        { type: "tool_end", name: "Write", ok: true },
        { type: "text", text: "Done." },
        { type: "done", stats: {} },
      ]);

    const result = await runner.run_turn(
      provider,
      "organize my notes",
      "harness",
    );

    expect(result).toEqual({ status: "done" });
    const session = rag_store.active;
    expect(session?.changed_files).toEqual(["notes/a.md", "notes/b.md"]);
    expect(session?.agent_session_id).toBe("sess-1");
    expect(refresh_vault).toHaveBeenCalledTimes(1);
    expect(sync_changed_notes).toHaveBeenCalledWith([
      "notes/a.md",
      "notes/b.md",
    ]);
    const assistant = session?.messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.content).toBe("Done.");
    expect(assistant?.tool_events).toHaveLength(3);
    expect(assistant?.tool_events?.every((e) => e.ok === true)).toBe(true);
    expect(rag_store.streaming_id).toBeNull();
  });

  it("does not refresh the vault when no mutating tools ran", async () => {
    const { runner, rag_store, refresh_vault } = make_harness([
      { type: "session", provider_session_id: "sess-1" },
      { type: "text", text: "Nothing to change." },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "just look around", "harness");

    expect(refresh_vault).not.toHaveBeenCalled();
    expect(rag_store.active?.changed_files).toEqual([]);
  });

  it("creates a git checkpoint before starting the stream", async () => {
    const { runner, calls, git } = make_harness([
      { type: "text", text: "ok" },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "harness");

    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["checkpoint", "stream"]);
  });

  it("passes the captured agent session id as resume id on the next turn", async () => {
    const { runner, starter } = make_harness([
      { type: "session", provider_session_id: "sess-1" },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "first turn", "harness");
    await runner.run_turn(provider, "second turn", "harness");

    const first = agent_request(starter.specs[0]!);
    const second = agent_request(starter.specs[1]!);
    expect(first.resume_session_id).toBeUndefined();
    expect(second.resume_session_id).toBe("sess-1");
    expect(first.toolset).toEqual({ kind: "read_only" });
    expect(starter.specs[0]?.kind).toBe("agent");
  });

  it("abort mid-run keeps the partial transcript and returns to idle", async () => {
    const { rag_store, vault_store } = make_stores();
    let release = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const starter = create_test_run_starter(() =>
      (async function* () {
        yield { type: "text", text: "partial " } as RunEvent;
        yield { type: "text", text: "answer" } as RunEvent;
        await blocked;
        yield { type: "done" } as RunEvent;
      })(),
    );
    const git = {
      create_checkpoint: vi
        .fn()
        .mockResolvedValue({ status: "created" as const }),
    };
    const refresh_vault = vi.fn();
    const runner = new AgentRunner(
      starter,
      rag_store,
      vault_store,
      git,
      refresh_vault,
      vi.fn(),
    );

    const running = runner.run_turn(provider, "organize my notes", "harness");
    await tick();
    expect(runner.is_running).toBe(true);
    runner.abort();
    release();
    const result = await running;

    expect(result).toEqual({ status: "done" });
    expect(starter.stop_count).toBe(1);
    expect(runner.is_running).toBe(false);
    expect(rag_store.streaming_id).toBeNull();
    expect(rag_store.is_loading).toBe(false);
    expect(rag_store.error).toBeNull();
    const assistant = rag_store.active?.messages.at(-1);
    expect(assistant?.content).toBe("partial answer");
  });

  it("surfaces stream errors and keeps the partial answer", async () => {
    const { runner, rag_store } = make_harness([
      { type: "text", text: "half" },
      { type: "error", message: "CLI crashed" },
    ]);

    const result = await runner.run_turn(
      provider,
      "organize my notes",
      "harness",
    );

    expect(result).toEqual({ status: "error", message: "CLI crashed" });
    expect(rag_store.error).toBe("CLI crashed");
    expect(rag_store.active?.messages.at(-1)?.content).toBe("half");
  });

  it("keeps the tool trail when a turn fails before producing any text", async () => {
    const { runner, rag_store } = make_harness([
      { type: "session", provider_session_id: "sess-1" },
      tool_start("mcp__carbide__read_note", '{"path":"clips/scraped.md"}', {
        paths: ["clips/scraped.md"],
      }),
      { type: "tool_end", name: "mcp__carbide__read_note", ok: true },
      { type: "error", message: "blocked by the provider" },
    ]);

    const result = await runner.run_turn(provider, "summarize", "harness");

    expect(result).toEqual({
      status: "error",
      message: "blocked by the provider",
    });
    const assistant = rag_store.active?.messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.content).toBe("");
    expect(assistant?.tool_events).toEqual([
      {
        name: "mcp__carbide__read_note",
        input_summary: '{"path":"clips/scraped.md"}',
        paths: ["clips/scraped.md"],
        ok: true,
      },
    ]);
    expect(assistant?.error).toBe("blocked by the provider");
  });

  it("records files a failed turn already wrote and refreshes the vault", async () => {
    const { runner, rag_store, refresh_vault } = make_harness([
      tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
        mutating: true,
      }),
      { type: "tool_end", name: "mcp__carbide__update_note", ok: true },
      { type: "error", message: "blocked by the provider" },
    ]);

    await runner.run_turn(provider, "rewrite my notes", "harness");

    expect(rag_store.active?.changed_files).toEqual(["notes/a.md"]);
    expect(refresh_vault).toHaveBeenCalledTimes(1);
  });

  // A mutating tool whose paths could not be resolved still left the vault
  // stale; the tree refresh must not be gated on path extraction succeeding.
  it("refreshes the vault when a mutating tool resolved no path", async () => {
    const { runner, rag_store, refresh_vault, sync_changed_notes } =
      make_harness([
        tool_start("Write", '{"content":"…truncated', { mutating: true }),
        { type: "tool_end", name: "Write", ok: true },
        { type: "done", stats: {} },
      ]);

    await runner.run_turn(provider, "write something", "harness");

    expect(refresh_vault).toHaveBeenCalledTimes(1);
    expect(sync_changed_notes).toHaveBeenCalledWith([]);
    expect(rag_store.active?.changed_files).toEqual([]);
  });

  it("does not sync notes when only read-only tools ran", async () => {
    const { runner, refresh_vault, sync_changed_notes } = make_harness([
      tool_start("mcp__carbide__read_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
      }),
      { type: "tool_end", name: "mcp__carbide__read_note", ok: true },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "just look around", "harness");

    expect(refresh_vault).not.toHaveBeenCalled();
    expect(sync_changed_notes).not.toHaveBeenCalled();
  });

  // R8: Wave 1 retargets where a turn's transcript lands by swapping the sink.
  // That only stays cheap while the runner writes through one, so this asserts
  // the mechanism, not just the behaviour.
  it("writes the transcript through the injected sink, never from the loop", async () => {
    const { rag_store, vault_store } = make_stores();
    let sink_seen = 0;
    const starter = {
      start: (_spec: RunSpec, sink?: import("$lib/features/assistant").RunSink) => {
        const events: RunEvent[] = [
          { type: "session", provider_session_id: "sess-1" },
          { type: "text", text: "hello" },
          { type: "done", stats: {} },
        ];
        // Deliberately dispatch nothing to the sink: with the writes living in
        // it, the store must stay untouched.
        if (sink) sink_seen = events.length;
        return Promise.resolve({
          id: "run-1",
          stop: () => {},
          outcome: Promise.resolve({
            status: "done" as const,
            text: "",
            stats: null,
          }),
        });
      },
    };
    const runner = new AgentRunner(
      starter,
      rag_store,
      vault_store,
      { create_checkpoint: vi.fn().mockResolvedValue({}) },
      vi.fn(),
      vi.fn(),
    );

    const before = rag_store.active?.messages.length ?? 0;
    await runner.run_turn(provider, "organize my notes", "harness");

    expect(sink_seen).toBe(3);
    expect(rag_store.active?.messages.length).toBe(before);
    expect(rag_store.active?.agent_session_id).toBeUndefined();
  });
});
