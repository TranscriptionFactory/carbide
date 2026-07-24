import { describe, expect, it, vi } from "vitest";
import { AgenticEditRunner } from "$lib/features/ai";
import type {
  AgentEvent,
  AgentPort,
  AgentStreamRequest,
} from "$lib/features/rag";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

const provider: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: { kind: "api", base_url: "http://localhost:11434/v1" },
};

function make_harness(events: AgentEvent[]) {
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
  const runner = new AgenticEditRunner(port, git);
  return { runner, calls, captured, git };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgenticEditRunner.run", () => {
  it("checkpoints before streaming and folds text deltas into a final edit", async () => {
    const { runner, calls, captured, git } = make_harness([
      { type: "init", session_id: "sess-1" },
      { type: "text", delta: "# " },
      { type: "text", delta: "Edited" },
      { type: "done", stats: {} },
    ]);
    const texts: string[] = [];

    const result = await runner.run({
      provider_config: provider,
      prompt: "tighten this",
      vault_path: "/vault",
      on_text: (partial) => texts.push(partial),
    });

    expect(result).toEqual({ success: true, output: "# Edited", error: null });
    expect(git.create_checkpoint).toHaveBeenCalledTimes(1);
    expect(calls).toEqual(["checkpoint", "stream"]);
    expect(texts).toEqual(["# ", "# Edited"]);
  });

  it("carries the read-only inline-edit toolset and a native backend", async () => {
    const { runner, captured } = make_harness([
      { type: "text", delta: "ok" },
      { type: "done", stats: {} },
    ]);

    await runner.run({
      provider_config: provider,
      prompt: "edit",
      vault_path: "/vault",
    });

    expect(captured[0]?.toolset).toEqual({
      kind: "only",
      names: ["read_note", "search_notes"],
    });
    expect(captured[0]?.backend).toBe("native");
    expect(captured[0]?.history).toEqual([]);
    expect(captured[0]?.vault_path).toBe("/vault");
  });

  it("stops folding events once aborted", async () => {
    const controller = new AbortController();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const port: AgentPort = {
      stream_turn: () =>
        (async function* () {
          yield { type: "text", delta: "partial " } as AgentEvent;
          await gate;
          yield { type: "text", delta: "more" } as AgentEvent;
        })(),
    };
    const git = {
      create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
    };
    const runner = new AgenticEditRunner(port, git);
    const texts: string[] = [];

    const running = runner.run({
      provider_config: provider,
      prompt: "edit",
      vault_path: "/vault",
      signal: controller.signal,
      on_text: (partial) => texts.push(partial),
    });
    await tick();
    controller.abort();
    release();
    const result = await running;

    expect(result.output).toBe("partial ");
    expect(texts).toEqual(["partial "]);
  });

  it("humanizes stream errors and keeps the partial output", async () => {
    const { runner } = make_harness([
      { type: "text", delta: "half" },
      { type: "error", message: "invalid api key" },
    ]);

    const result = await runner.run({
      provider_config: provider,
      prompt: "edit",
      vault_path: "/vault",
    });

    expect(result.success).toBe(false);
    expect(result.output).toBe("half");
    expect(result.error).toContain("check your API key");
  });
});
