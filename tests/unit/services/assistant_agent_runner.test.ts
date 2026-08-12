import { describe, expect, it, vi } from "vitest";
import { AgentRunner } from "$lib/features/assistant";
import { AssistantChatStore } from "$lib/features/assistant";
import type { AgentCheckpointOutcome } from "$lib/features/assistant/application/agent_runner";
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
  // Each read returns a fresh, larger value, so a capture taken at the tool
  // call and a capture taken at the end of the turn are distinguishable.
  let next_mtime = 1_000;
  const read_note_mtime = vi.fn((note_path: string) => {
    calls.push(`mtime:${note_path}`);
    next_mtime += 1;
    return Promise.resolve(next_mtime);
  });
  const runner = new AgentRunner(
    starter,
    rag_store,
    vault_store,
    git,
    refresh_vault,
    sync_changed_notes,
    proposals,
    read_note_mtime,
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
    read_note_mtime,
  };
}

function tool_start(
  name: string,
  input_summary: string,
  extra: { paths?: string[]; mutating?: boolean; id?: string } = {},
): RunEvent {
  return {
    type: "tool_start",
    id: extra.id ?? name,
    name,
    kind: "other",
    input_summary,
    paths: extra.paths ?? [],
    mutating: extra.mutating ?? false,
    locations: [],
  };
}

function tool_end(
  name: string,
  extra: {
    ok?: boolean;
    result_summary?: string;
    paths?: string[];
    mutating?: boolean;
    id?: string;
  } = {},
): RunEvent {
  return {
    type: "tool_end",
    id: extra.id ?? name,
    name,
    ok: extra.ok ?? true,
    ...(extra.result_summary !== undefined
      ? { result_summary: extra.result_summary }
      : {}),
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
        tool_end("mcp__carbide__read_note"),
        tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
          paths: ["notes/a.md"],
          mutating: true,
        }),
        tool_end("mcp__carbide__update_note"),
        tool_start("Write", '{"content":"…truncated', {
          paths: ["/test/vault/notes/b.md"],
          mutating: true,
        }),
        tool_end("Write"),
        { type: "text", text: "Done." },
        { type: "done", stats: {} },
      ]);

    const result = await runner.run_turn(provider, "organize my notes", "acp");

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

  it("forwards reasoning into the streaming transcript", async () => {
    const { runner, rag_store } = make_harness([
      { type: "reasoning", text: "Let me " },
      { type: "reasoning", text: "look." },
      { type: "text", text: "Done." },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    const assistant = rag_store.active?.messages.at(-1);
    expect(assistant?.reasoning).toBe("Let me look.");
    expect(assistant?.content).toBe("Done.");
  });

  it("records the tool_end result summary on the folded event", async () => {
    const { runner, rag_store } = make_harness([
      tool_start("mcp__carbide__search_notes", '{"query":"projects"}'),
      tool_end("mcp__carbide__search_notes", { result_summary: "3 matches" }),
      { type: "text", text: "Found them." },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    const events = rag_store.active?.messages.at(-1)?.tool_events ?? [];
    expect(events[0]?.ok).toBe(true);
    expect(events[0]?.result_summary).toBe("3 matches");
  });

  it("does not refresh the vault when no mutating tools ran", async () => {
    const { runner, rag_store, refresh_vault } = make_harness([
      { type: "session", provider_session_id: "sess-1" },
      { type: "text", text: "Nothing to change." },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "just look around", "acp");

    expect(refresh_vault).not.toHaveBeenCalled();
    expect(rag_store.active?.changed_files).toEqual([]);
  });

  it("creates a git checkpoint before starting the stream", async () => {
    const { runner, calls, git } = make_harness([
      { type: "text", text: "ok" },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["checkpoint", "stream"]);
  });

  it("passes the captured agent session id as resume id on the next turn", async () => {
    const { runner, starter } = make_harness([
      { type: "session", provider_session_id: "sess-1" },
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "first turn", "acp");
    await runner.run_turn(provider, "second turn", "acp");

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
      () => Promise.resolve(1_000),
    );

    const running = runner.run_turn(provider, "organize my notes", "acp");
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

    const result = await runner.run_turn(provider, "organize my notes", "acp");

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
      tool_end("mcp__carbide__read_note"),
      { type: "error", message: "blocked by the provider" },
    ]);

    const result = await runner.run_turn(provider, "summarize", "acp");

    expect(result).toEqual({
      status: "error",
      message: "blocked by the provider",
    });
    const assistant = rag_store.active?.messages.at(-1);
    expect(assistant?.role).toBe("assistant");
    expect(assistant?.content).toBe("");
    expect(assistant?.tool_events).toEqual([
      {
        id: "mcp__carbide__read_note",
        name: "mcp__carbide__read_note",
        kind: "other",
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
      tool_end("mcp__carbide__update_note"),
      { type: "error", message: "blocked by the provider" },
    ]);

    await runner.run_turn(provider, "rewrite my notes", "acp");

    expect(rag_store.active?.changed_files).toEqual(["notes/a.md"]);
    expect(refresh_vault).toHaveBeenCalledTimes(1);
  });

  // A mutating tool whose paths could not be resolved still left the vault
  // stale; the tree refresh must not be gated on path extraction succeeding.
  it("refreshes the vault when a mutating tool resolved no path", async () => {
    const { runner, rag_store, refresh_vault, sync_changed_notes } =
      make_harness([
        tool_start("Write", '{"content":"…truncated', { mutating: true }),
        tool_end("Write"),
        { type: "done", stats: {} },
      ]);

    await runner.run_turn(provider, "write something", "acp");

    expect(refresh_vault).toHaveBeenCalledTimes(1);
    expect(sync_changed_notes).toHaveBeenCalledWith([]);
    expect(rag_store.active?.changed_files).toEqual([]);
  });

  it("does not sync notes when only read-only tools ran", async () => {
    const { runner, refresh_vault, sync_changed_notes } = make_harness([
      tool_start("mcp__carbide__read_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
      }),
      tool_end("mcp__carbide__read_note"),
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "just look around", "acp");

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
      () => Promise.resolve(1_000),
    );

    const before = rag_store.active?.messages.length ?? 0;
    await runner.run_turn(provider, "organize my notes", "acp");

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
    tool_end("mcp__carbide__update_note"),
    { type: "text", text: "Done." },
    { type: "done", stats: {} },
  ];

  it("hands the checkpoint sha to the producer as the diff anchor", async () => {
    const { runner, proposals } = make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(proposals.produce).toHaveBeenCalledTimes(1);
    expect(proposals.produce.mock.calls[0]?.[0]).toMatchObject({
      anchor: "anchor-sha",
      touched_paths: ["notes/a.md"],
    });
  });

  it("stamps the turn's session and run onto the proposals' origin", async () => {
    const { runner, rag_store, proposals } = make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "acp");

    const request = proposals.produce.mock.calls[0]?.[0];
    expect(request?.origin.session_id).toBe(rag_store.active?.id);
    expect(typeof request?.origin.run_id).toBe("string");
  });

  // Producing proposals rolls the notes back, so the vault refresh and the
  // open-note sync must run after it or they land on content that is about
  // to change underneath them.
  it("produces proposals before refreshing the vault", async () => {
    const { runner, calls } = make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "acp");

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

    const result = await runner.run_turn(provider, "organize my notes", "acp");

    expect(result).toEqual({ status: "done" });
    expect(proposals.produce.mock.calls[0]?.[0].anchor).toBeNull();
  });

  it("skips production entirely for a turn that wrote nothing", async () => {
    const { runner, proposals } = make_harness([
      tool_start("mcp__carbide__read_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
      }),
      tool_end("mcp__carbide__read_note"),
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

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
      tool_end("mcp__carbide__update_note"),
      { type: "error", message: "provider exploded" },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(proposals.produce).toHaveBeenCalledTimes(1);
  });

  // Chain B. The harness announces a mutating tool's paths BEFORE the
  // permission gate and restates them on the terminal event even when the tool
  // never ran, so a permissive path set reverts a file the user said no to.
  it("keeps a denied tool's path out of the rollback scope", async () => {
    const { runner, proposals } = make_harness([
      tool_start("mcp__carbide__update_note", '{"path":"notes/denied.md"}', {
        paths: ["notes/denied.md"],
        mutating: true,
        id: "denied",
      }),
      tool_end("mcp__carbide__update_note", { ok: false, id: "denied" }),
      tool_start("mcp__carbide__update_note", '{"path":"notes/allowed.md"}', {
        paths: ["notes/allowed.md"],
        mutating: true,
        id: "allowed",
      }),
      tool_end("mcp__carbide__update_note", { id: "allowed" }),
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(proposals.produce.mock.calls[0]?.[0].touched_paths).toEqual([
      "notes/allowed.md",
    ]);
  });

  it("produces nothing at all for a turn whose only write was denied", async () => {
    const { runner, proposals } = make_harness([
      tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
        paths: ["notes/a.md"],
        mutating: true,
      }),
      tool_end("mcp__carbide__update_note", { ok: false }),
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(proposals.produce).not.toHaveBeenCalled();
  });

  // The two sets must not collapse into one: a denied tool may still have left
  // the vault stale, so the refresh stays permissive while the rollback does not.
  it("still refreshes a denied tool's path even though it is not rolled back", async () => {
    const { runner, rag_store, refresh_vault, sync_changed_notes } =
      make_harness([
        tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
          paths: ["notes/a.md"],
          mutating: true,
        }),
        tool_end("mcp__carbide__update_note", { ok: false }),
        { type: "done", stats: {} },
      ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(refresh_vault).toHaveBeenCalledTimes(1);
    expect(sync_changed_notes).toHaveBeenCalledWith(["notes/a.md"]);
    expect(rag_store.active?.changed_files).toEqual(["notes/a.md"]);
  });

  it("reads the guard mtime at the writing tool call, before the turn ends", async () => {
    const { runner, calls, proposals, read_note_mtime } =
      make_harness(writing_turn);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(read_note_mtime).toHaveBeenCalledWith("notes/a.md");
    expect(calls.indexOf("mtime:notes/a.md")).toBeGreaterThan(-1);
    expect(calls.indexOf("mtime:notes/a.md")).toBeLessThan(
      calls.indexOf("proposals"),
    );
    // The first value the reader handed out, not one taken after the turn.
    expect(proposals.produce.mock.calls[0]?.[0].expected_mtimes).toEqual({
      "notes/a.md": 1_001,
    });
  });

  // The reported scenario, end to end: the user's save lands DURING the turn,
  // after the agent's write. An mtime captured once the turn is over already
  // contains that save, so the guard would compare equal, pass, and let the
  // rollback destroy the very bytes it exists to protect. Moving the capture to
  // the end of the turn must fail this test.
  it("captures the mtime the agent's write left, not one a later user save bumped", async () => {
    const { rag_store, vault_store } = make_stores();
    let disk_mtime = 1_000;
    const starter = create_test_run_starter(() =>
      (async function* () {
        yield tool_start("mcp__carbide__update_note", '{"path":"notes/a.md"}', {
          paths: ["notes/a.md"],
          mutating: true,
        });
        yield tool_end("mcp__carbide__update_note");
        // The user saves the same note while the turn is still running.
        disk_mtime = 9_999;
        yield { type: "text", text: "Done." } as RunEvent;
        yield { type: "done", stats: {} } as RunEvent;
      })(),
    );
    const proposals = create_test_proposal_producer();
    const runner = new AgentRunner(
      starter,
      rag_store,
      vault_store,
      {
        create_checkpoint: vi
          .fn()
          .mockResolvedValue({ status: "created" as const, sha: "anchor-sha" }),
      },
      vi.fn(),
      vi.fn(),
      proposals,
      () => Promise.resolve(disk_mtime),
    );

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(proposals.produce.mock.calls[0]?.[0].expected_mtimes).toEqual({
      "notes/a.md": 1_000,
    });
  });

  it("captures no mtime for a denied tool's path", async () => {
    const { runner, proposals, read_note_mtime } = make_harness([
      tool_start("mcp__carbide__update_note", '{"path":"notes/denied.md"}', {
        paths: ["notes/denied.md"],
        mutating: true,
        id: "denied",
      }),
      tool_end("mcp__carbide__update_note", { ok: false, id: "denied" }),
      tool_start("mcp__carbide__update_note", '{"path":"notes/allowed.md"}', {
        paths: ["notes/allowed.md"],
        mutating: true,
        id: "allowed",
      }),
      tool_end("mcp__carbide__update_note", { id: "allowed" }),
      { type: "done", stats: {} },
    ]);

    await runner.run_turn(provider, "organize my notes", "acp");

    expect(read_note_mtime).toHaveBeenCalledTimes(1);
    expect(proposals.produce.mock.calls[0]?.[0].expected_mtimes).toEqual({
      "notes/allowed.md": 1_001,
    });
  });

  // A read that fails leaves the note unguarded rather than failing the turn;
  // the rollback then behaves as it did before this guard existed.
  it("omits a path whose mtime could not be read instead of throwing", async () => {
    const { rag_store, vault_store } = make_stores();
    const starter = create_test_run_starter(() => writing_turn);
    const proposals = create_test_proposal_producer();
    const runner = new AgentRunner(
      starter,
      rag_store,
      vault_store,
      {
        create_checkpoint: vi
          .fn()
          .mockResolvedValue({ status: "created" as const, sha: "anchor-sha" }),
      },
      vi.fn(),
      vi.fn(),
      proposals,
      () => Promise.reject(new Error("note vanished")),
    );

    const result = await runner.run_turn(provider, "organize my notes", "acp");

    expect(result).toEqual({ status: "done" });
    expect(proposals.produce.mock.calls[0]?.[0].expected_mtimes).toEqual({});
  });

  it("does not fail the turn when production throws", async () => {
    const { runner, proposals } = make_harness(writing_turn);
    proposals.produce.mockRejectedValue(new Error("diff unavailable"));

    const result = await runner.run_turn(provider, "organize my notes", "acp");

    expect(result).toEqual({ status: "done" });
  });
});
