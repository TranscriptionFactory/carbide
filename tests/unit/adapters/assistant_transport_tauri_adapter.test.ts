import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("$lib/shared/adapters/tauri_invoke", () => ({
  tauri_invoke: vi.fn(),
}));

import { listen } from "@tauri-apps/api/event";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { create_assistant_transport_tauri_adapter } from "$lib/features/assistant/adapters/assistant_transport_tauri_adapter";
import type { RunEvent, RunRequest } from "$lib/features/assistant";
import { make_provider } from "../helpers/assistant_fixtures";

const mock_listen = vi.mocked(listen);
const mock_invoke = vi.mocked(tauri_invoke);

type EventHandler = (event: {
  event: string;
  id: number;
  payload: unknown;
}) => void;

type OpenChannel = {
  name: string;
  emit: (payload: unknown) => void;
  unlisten: ReturnType<typeof vi.fn>;
};

let channels: OpenChannel[] = [];

function channel(index: number): OpenChannel {
  const open = channels[index];
  if (!open) throw new Error(`no channel opened at index ${String(index)}`);
  return open;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function collect(iterable: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const events: RunEvent[] = [];
  for await (const event of iterable) events.push(event);
  return events;
}

function start_args_of(command: string): Record<string, unknown> {
  const call = mock_invoke.mock.calls.find(([name]) => name === command);
  if (!call) throw new Error(`no invoke of ${command}`);
  return call[1] ?? {};
}

const text_request: RunRequest = {
  mode: "text",
  system_prompt: "be terse",
  messages: [{ role: "user", content: "hello" }],
  model: "sonnet",
};

const agent_request: RunRequest = {
  mode: "agent",
  prompt: "summarize the vault",
  toolset: { kind: "read_only" },
  history: [{ role: "user", content: "earlier" }],
  resume_session_id: "sess-7",
  backend: "harness",
};

function stream_text(signal?: AbortSignal) {
  return create_assistant_transport_tauri_adapter().stream({
    provider_config: make_provider(),
    request: text_request,
    vault_path: "/vault",
    ...(signal ? { signal } : {}),
  });
}

function stream_agent(signal?: AbortSignal) {
  return create_assistant_transport_tauri_adapter().stream({
    provider_config: make_provider(),
    request: agent_request,
    vault_path: "/vault",
    ...(signal ? { signal } : {}),
  });
}

describe("assistant_transport_tauri_adapter", () => {
  beforeEach(() => {
    channels = [];
    mock_listen.mockReset();
    mock_invoke.mockReset();
    mock_invoke.mockResolvedValue(undefined);
    mock_listen.mockImplementation((name, handler) => {
      const unlisten = vi.fn();
      channels.push({
        name,
        unlisten,
        emit: (payload) => {
          (handler as EventHandler)({ event: name, id: 1, payload });
        },
      });
      return Promise.resolve(unlisten);
    });
  });

  describe("text mode", () => {
    it("invokes ai_stream_start with flat args and listens on the chunk channel", async () => {
      stream_text();
      await flush();

      const args = start_args_of("ai_stream_start");
      expect(args).toEqual({
        requestId: expect.any(String) as string,
        providerConfig: make_provider(),
        systemPrompt: "be terse",
        messages: [{ role: "user", content: "hello" }],
        model: "sonnet",
        vaultPath: "/vault",
      });
      expect(channel(0).name).toBe(`ai:chunk:${String(args.requestId)}`);
    });

    it("normalizes text, reasoning and done chunks", async () => {
      const collected = collect(stream_text());
      await flush();

      channel(0).emit({ type: "text", text: "hi" });
      channel(0).emit({ type: "reasoning", text: "thinking" });
      channel(0).emit({ type: "done" });

      expect(await collected).toEqual([
        { type: "text", text: "hi" },
        { type: "reasoning", text: "thinking" },
        { type: "done" },
      ]);
    });
  });

  describe("agent mode", () => {
    it("invokes agent_run_start with the nested spec and listens on the run-event channel", async () => {
      stream_agent();
      await flush();

      const args = start_args_of("agent_run_start");
      expect(args.spec).toEqual({
        provider_config: make_provider(),
        prompt: "summarize the vault",
        vault_path: "/vault",
        toolset: { kind: "read_only" },
        history: [{ role: "user", content: "earlier" }],
        resume_session_id: "sess-7",
        backend: "harness",
        adapter: "claude",
      });
      expect(channel(0).name).toBe(`agent-run-event:${String(args.requestId)}`);
    });

    it("normalizes init to session and text.delta to text", async () => {
      const collected = collect(stream_agent());
      await flush();

      channel(0).emit({ type: "init", session_id: "prov-42" });
      channel(0).emit({ type: "text", delta: "hi" });
      channel(0).emit({ type: "reasoning", delta: "thinking" });
      channel(0).emit({ type: "done", stats: { num_turns: 2 } });

      expect(await collected).toEqual([
        { type: "session", provider_session_id: "prov-42" },
        { type: "text", text: "hi" },
        { type: "reasoning", text: "thinking" },
        { type: "done", stats: { num_turns: 2 } },
      ]);
    });

    it("passes tool_start and tool_end fields through", async () => {
      const collected = collect(stream_agent());
      await flush();

      channel(0).emit({
        type: "tool_start",
        name: "write_file",
        input_summary: "notes/a.md",
        paths: ["notes/a.md"],
        mutating: true,
      });
      channel(0).emit({
        type: "tool_end",
        name: "write_file",
        ok: true,
        result_summary: "wrote 12 bytes",
      });
      channel(0).emit({ type: "done", stats: {} });

      expect(await collected).toEqual([
        {
          type: "tool_start",
          name: "write_file",
          input_summary: "notes/a.md",
          paths: ["notes/a.md"],
          mutating: true,
        },
        {
          type: "tool_end",
          name: "write_file",
          ok: true,
          result_summary: "wrote 12 bytes",
        },
        { type: "done", stats: {} },
      ]);
    });
  });

  it("mints a fresh request id per stream and keeps concurrent channels apart", async () => {
    const first = collect(stream_text());
    const second = collect(stream_text());
    await flush();

    expect(channels).toHaveLength(2);
    expect(channel(0).name).not.toBe(channel(1).name);

    channel(0).emit({ type: "text", text: "first" });
    channel(0).emit({ type: "done" });
    channel(1).emit({ type: "text", text: "second" });
    channel(1).emit({ type: "done" });

    expect(await first).toEqual([
      { type: "text", text: "first" },
      { type: "done" },
    ]);
    expect(await second).toEqual([
      { type: "text", text: "second" },
      { type: "done" },
    ]);
  });

  it("ends iteration and unlistens on a done event", async () => {
    const collected = collect(stream_text());
    await flush();

    channel(0).emit({ type: "done" });

    expect(await collected).toEqual([{ type: "done" }]);
    expect(channel(0).unlisten).toHaveBeenCalledTimes(1);
  });

  it("ends iteration and unlistens on an error event", async () => {
    const collected = collect(stream_text());
    await flush();

    channel(0).emit({ type: "error", error: "boom" });

    expect(await collected).toEqual([{ type: "error", message: "boom" }]);
    expect(channel(0).unlisten).toHaveBeenCalledTimes(1);
  });

  it("aborts a text stream through ai_stream_abort", async () => {
    const controller = new AbortController();
    const collected = collect(stream_text(controller.signal));
    await flush();

    const request_id = start_args_of("ai_stream_start").requestId;
    controller.abort();

    expect(await collected).toEqual([]);
    expect(mock_invoke).toHaveBeenCalledWith("ai_stream_abort", {
      requestId: request_id,
    });
  });

  it("aborts an agent turn through agent_run_abort", async () => {
    const controller = new AbortController();
    const collected = collect(stream_agent(controller.signal));
    await flush();

    const request_id = start_args_of("agent_run_start").requestId;
    controller.abort();

    expect(await collected).toEqual([]);
    expect(mock_invoke).toHaveBeenCalledWith("agent_run_abort", {
      requestId: request_id,
    });
  });

  it("never starts when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const collected = collect(stream_text(controller.signal));
    await flush();

    expect(await collected).toEqual([]);
    expect(mock_invoke).toHaveBeenCalledTimes(1);
    expect(mock_invoke).toHaveBeenCalledWith("ai_stream_abort", {
      requestId: expect.any(String) as string,
    });
  });

  it("surfaces a rejected start invoke as one raw error event, then ends", async () => {
    const raw = "spawn claude ENOENT: ANTHROPIC_API_KEY is not set";
    mock_invoke.mockRejectedValueOnce(new Error(raw));

    const collected = collect(stream_text());
    await flush();

    const events = await collected;
    expect(events).toEqual([{ type: "error", message: raw }]);
    expect(channel(0).unlisten).toHaveBeenCalledTimes(1);
  });

  it("preserves raw provider error text from both wire shapes", async () => {
    const raw = "Error: spawn claude ENOENT (exit 127)";

    const from_text = collect(stream_text());
    await flush();
    channel(0).emit({ type: "error", error: raw });

    const from_agent = collect(stream_agent());
    await flush();
    channel(1).emit({ type: "error", message: raw });

    expect(await from_text).toEqual([{ type: "error", message: raw }]);
    expect(await from_agent).toEqual([{ type: "error", message: raw }]);
  });

  it("removes the abort listener on normal completion", async () => {
    const controller = new AbortController();
    const remove_spy = vi.spyOn(controller.signal, "removeEventListener");

    const collected = collect(stream_text(controller.signal));
    await flush();

    channel(0).emit({ type: "done" });
    await collected;

    expect(remove_spy).toHaveBeenCalledWith(
      "abort",
      expect.any(Function) as () => void,
    );
  });
});
