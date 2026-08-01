import { describe, expect, it, vi } from "vitest";
import { AgenticEditRunner } from "$lib/features/ai";
import type { RunEvent, RunRequest, RunSpec } from "$lib/features/assistant";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { create_test_run_starter } from "../../adapters/test_run_starter";

const provider: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: { kind: "api", base_url: "http://localhost:11434/v1" },
};

function agent_request(spec: RunSpec): Extract<RunRequest, { mode: "agent" }> {
  if (spec.request.mode !== "agent") {
    throw new Error("expected an agent-mode run");
  }
  return spec.request;
}

function make_harness(events: RunEvent[]) {
  const calls: string[] = [];
  const starter = create_test_run_starter(() => {
    calls.push("stream");
    return events;
  });
  const git = {
    create_checkpoint: vi.fn((_description: string) => {
      calls.push("checkpoint");
      return Promise.resolve({ status: "created" as const });
    }),
  };
  const runner = new AgenticEditRunner(starter, git);
  return { runner, calls, starter, git };
}

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("AgenticEditRunner.run", () => {
  it("checkpoints before streaming and folds text deltas into a final edit", async () => {
    const { runner, calls, git } = make_harness([
      { type: "session", provider_session_id: "sess-1" },
      { type: "text", text: "# " },
      { type: "text", text: "Edited" },
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
    const { runner, starter } = make_harness([
      { type: "text", text: "ok" },
      { type: "done", stats: {} },
    ]);

    await runner.run({
      provider_config: provider,
      prompt: "edit",
      vault_path: "/vault",
    });

    const request = agent_request(starter.specs[0]!);
    expect(request.toolset).toEqual({
      kind: "only",
      names: ["read_note", "search_notes"],
    });
    expect(request.backend).toBe("native");
    expect(request.history).toEqual([]);
    expect(starter.specs[0]?.kind).toBe("inline");
  });

  it("stops folding events once the run is stopped", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const starter = create_test_run_starter(() =>
      (async function* () {
        yield { type: "text", text: "partial " } as RunEvent;
        await gate;
        yield { type: "text", text: "more" } as RunEvent;
      })(),
    );
    const git = {
      create_checkpoint: vi.fn().mockResolvedValue({ status: "created" }),
    };
    const runner = new AgenticEditRunner(starter, git);
    const texts: string[] = [];

    const running = runner.run({
      provider_config: provider,
      prompt: "edit",
      vault_path: "/vault",
      on_run_started: (handle) => {
        setTimeout(() => {
          handle.stop();
          release();
        }, 0);
      },
      on_text: (partial) => texts.push(partial),
    });
    await tick();
    const result = await running;

    expect(result.output).toBe("partial ");
    expect(texts).toEqual(["partial "]);
    expect(starter.stop_count).toBe(1);
  });

  // Humanization moved to the kernel, the single choke point. The runner's job
  // is to surface that message unchanged rather than re-derive its own.
  it("surfaces the kernel's error message and keeps the partial output", async () => {
    const { runner } = make_harness([
      { type: "text", text: "half" },
      {
        type: "error",
        message:
          "Ollama rejected the request — check your API key in Settings.",
      },
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
