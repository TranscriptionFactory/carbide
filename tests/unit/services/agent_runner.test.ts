import { describe, expect, it, vi } from "vitest";
import { AgentRunner } from "$lib/features/rag";
import { AssistantChatStore } from "$lib/features/assistant";
import type { AgentCheckpointOutcome } from "$lib/features/rag/application/agent_runner";
import { AssistantSessionStore } from "$lib/features/assistant";
import type {
  RunEvent,
  RunRequest,
  RunSink,
  RunSpec,
} from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { create_test_vault } from "../helpers/test_fixtures";
import { create_test_run_starter } from "../../adapters/test_run_starter";
import { create_test_proposal_producer } from "../helpers/test_agent_proposals";

const provider: AiProviderConfig = {
  id: "claude",
  name: "Claude Code",
  transport: { kind: "cli", command: "claude", args: ["-p"] },
};

function make_stores() {
  const rag_store = new AssistantChatStore(new AssistantSessionStore());
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
    create_checkpoint: vi.fn(
      (_description: string): Promise<AgentCheckpointOutcome> => {
        calls.push("checkpoint");
        return Promise.resolve({ status: "created", sha: "anchor-sha" });
      },
    ),
  };
  const refresh_vault = vi.fn(() => {
    calls.push("refresh_vault");
  });
  const sync_changed_notes = vi.fn();
  const proposals = create_test_proposal_producer(calls);
  const runner = new AgentRunner(
    starter,
    rag_store,
    vault_store,
    git,
    refresh_vault,
    sync_changed_notes,
    proposals,
  );
  return {
    runner,
    rag_store,
    calls,
    starter,
    git,
    refresh_vault,
    sync_changed_notes,
    proposals,
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
        .mockResolvedValue({ status: "created" as const, sha: "anchor-sha" }),
    };
    const refresh_vault = vi.fn();
    const runner = new AgentRunner(
      starter,
      rag_store,
      vault_store,
      git,
      refresh_vault,
      vi.fn(),
      create_test_proposal_producer(),
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
    let sink_passed = false;
    const starter = {
      start: (_spec: RunSpec, sink?: RunSink) => {
        // Deliberately dispatch nothing to the sink: with the writes living in
        // it, the store must stay untouched.
        sink_passed = sink !== undefined;
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
      {
        create_checkpoint: vi
          .fn()
          .mockResolvedValue({ status: "no_repo" as const }),
      },
      vi.fn(),
      vi.fn(),
      create_test_proposal_producer(),
    );

    const before = rag_store.active?.messages.length ?? 0;
    await runner.run_turn(provider, "organize my notes", "harness");

    expect(sink_passed).toBe(true);
    expect(rag_store.active?.messages.length).toBe(before);
    expect(rag_store.active?.agent_session_id).toBeUndefined();
  });
});

describe("AgentRunner end-of-turn proposals", () => {
  const writing_turn: RunEvent[] = [
    tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
      paths: ["notes/a.md"],
      mutating: true,
    }),
    { type: "tool_end", name: "mcp__carbide__update_note", ok: true },
    { type: "text", text: "Done." },
    { type: "done", stats: {} },
  ];

  it("hands the checkpoint sha to the producer as the diff anchor", async () => {
    const { runner, proposals } = make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "harness");

    expect(proposals.produce).toHaveBeenCalledTimes(1);
    expect(proposals.produce.mock.calls[0]?.[0]).toMatchObject({
      anchor: "anchor-sha",
      touched_paths: ["notes/a.md"],
    });
  });

  it("stamps the turn's session and run onto the proposals' origin", async () => {
    const { runner, rag_store, proposals } = make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "harness");

    const request = proposals.produce.mock.calls[0]?.[0];
    expect(request?.origin.session_id).toBe(rag_store.active?.id);
    expect(typeof request?.origin.run_id).toBe("string");
  });

  // Producing proposals rolls the notes back, so the vault refresh and the
  // open-note sync must run after it or they land on content that is about
  // to change underneath them.
  it("produces proposals before refreshing the vault", async () => {
    const { runner, calls } = make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "harness");

    expect(calls.indexOf("proposals")).toBeGreaterThan(-1);
    expect(calls.indexOf("proposals")).toBeLessThan(
      calls.indexOf("refresh_vault"),
    );
  });

  // Named I5 carve-out: a vault without git yields no anchor, and the turn
  // still completes with its writes on disk.
  it("passes a null anchor through when no checkpoint was taken", async () => {
    const { runner, git, proposals } = make_harness(writing_turn);
    git.create_checkpoint.mockResolvedValue({ status: "no_repo" as const });

    const result = await runner.run_turn(
      provider,
      "organize my notes",
      "harness",
    );

    expect(result).toEqual({ status: "done" });
    expect(proposals.produce.mock.calls[0]?.[0].anchor).toBeNull();
  });

  it("skips production entirely for a turn that wrote nothing", async () => {
    const { runner, proposals } = make_harness([
      tool_start("mcp__carbide__read_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
      }),
      { type: "tool_end", name: "mcp__carbide__read_note", ok: true },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "harness");

    expect(proposals.produce).not.toHaveBeenCalled();
  });

  // A turn that failed after writing still left edits on disk, so they still
  // have to reach the review queue.
  it("still produces proposals when the turn ends in an error", async () => {
    const { runner, proposals } = make_harness([
      tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
        mutating: true,
      }),
      { type: "tool_end", name: "mcp__carbide__update_note", ok: true },
      { type: "error", message: "provider exploded" },
    ]);

    await runner.run_turn(provider, "organize my notes", "harness");

    expect(proposals.produce).toHaveBeenCalledTimes(1);
  });

  it("does not fail the turn when production throws", async () => {
    const { runner, proposals } = make_harness(writing_turn);
    proposals.produce.mockRejectedValue(new Error("diff unavailable"));

    const result = await runner.run_turn(
      provider,
      "organize my notes",
      "harness",
    );

    expect(result).toEqual({ status: "done" });
  });
});
