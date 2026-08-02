import { describe, expect, it } from "vitest";
import type { AiCliProbeStatus } from "$lib/features/ai";
import {
  AssistantKernelService,
  AssistantRunStore,
  type AssistantProviderProbePort,
  type AssistantTransportPort,
  type RunEvent,
  type RunId,
  type RunOutcome,
  type RunSink,
  type RunSpec,
} from "$lib/features/assistant";
import {
  create_manual_transport,
  create_mock_probe_port,
  create_mock_transport,
  make_provider,
  make_run_spec,
} from "../helpers/assistant_fixtures";

const PROVIDER = make_provider();

function run_spec(overrides: Partial<RunSpec> = {}): RunSpec {
  return make_run_spec({ provider: PROVIDER, ...overrides });
}

function create_kernel(
  transport: AssistantTransportPort,
  vault_path: string | null = "/vault",
) {
  const run_store = new AssistantRunStore();
  const kernel = new AssistantKernelService({
    transport,
    probe: create_mock_probe_port(),
    run_store,
    vault_path: () => vault_path,
    providers: () => [PROVIDER],
    default_provider_id: () => PROVIDER.id,
  });
  return { kernel, run_store };
}

function agent_spec(): RunSpec {
  return run_spec({
    kind: "agent",
    request: {
      mode: "agent",
      prompt: "summarize the vault",
      toolset: { kind: "read_only" },
      history: [],
      backend: "native",
    },
  });
}

type Received = { id: RunId; event: RunEvent };

function create_recording_sink(): RunSink & {
  received: Received[];
  ended: { id: RunId; outcome: RunOutcome }[];
} {
  const received: Received[] = [];
  const ended: { id: RunId; outcome: RunOutcome }[] = [];
  return {
    received,
    ended,
    on_event(id, event) {
      received.push({ id, event });
    },
    on_end(id, outcome) {
      ended.push({ id, outcome });
    },
  };
}

function create_throwing_transport(message: string): AssistantTransportPort {
  return {
    stream(): AsyncIterable<RunEvent> {
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async *[Symbol.asyncIterator]() {
          yield { type: "text", text: "partial" } satisfies RunEvent;
          throw new Error(message);
        },
      };
    },
  };
}

describe("AssistantKernelService", () => {
  it("returns a handle whose id matches the created record", async () => {
    const { kernel, run_store } = create_kernel(create_mock_transport());

    const handle = await kernel.start(run_spec({ label: "Tighten prose" }));

    const record = run_store.get(handle.id);
    expect(record?.id).toBe(handle.id);
    expect(record?.label).toBe("Tighten prose");
    expect(record?.provider_id).toBe(PROVIDER.id);
  });

  it("delivers events to the per-run sink and every registered global sink", async () => {
    const { kernel } = create_kernel(
      create_mock_transport([{ type: "text", text: "hi" }, { type: "done" }]),
    );
    const per_run = create_recording_sink();
    const global_one = create_recording_sink();
    const global_two = create_recording_sink();
    kernel.register_sink(global_one);
    kernel.register_sink(global_two);

    const handle = await kernel.start(run_spec(), per_run);
    await handle.outcome;

    const expected: Received[] = [
      { id: handle.id, event: { type: "text", text: "hi" } },
      { id: handle.id, event: { type: "done" } },
    ];
    expect(per_run.received).toEqual(expected);
    expect(global_one.received).toEqual(expected);
    expect(global_two.received).toEqual(expected);
  });

  it("gives a per-run sink only its own run's events", async () => {
    const { kernel } = create_kernel(
      create_mock_transport([{ type: "text", text: "hi" }, { type: "done" }]),
    );
    const sink_one = create_recording_sink();
    const sink_two = create_recording_sink();

    const first = await kernel.start(run_spec(), sink_one);
    const second = await kernel.start(run_spec(), sink_two);
    await Promise.all([first.outcome, second.outcome]);

    expect(sink_one.received.map((entry) => entry.id)).toEqual([
      first.id,
      first.id,
    ]);
    expect(sink_two.received.map((entry) => entry.id)).toEqual([
      second.id,
      second.id,
    ]);
  });

  it("stops delivery on unsubscribe while the run keeps streaming (I2)", async () => {
    const transport = create_manual_transport();
    const { kernel, run_store } = create_kernel(transport);
    const sink = create_recording_sink();
    const unsubscribe = kernel.register_sink(sink);

    const handle = await kernel.start(run_spec());
    expect(transport.channel().is_waiting()).toBe(true);
    await transport.channel().emit({ type: "text", text: "one" });

    unsubscribe();
    expect(transport.channel().is_waiting()).toBe(true);
    await transport.channel().emit({ type: "text", text: "two" });

    expect(sink.received).toEqual([
      { id: handle.id, event: { type: "text", text: "one" } },
    ]);
    expect(kernel.is_running(handle.id)).toBe(true);
    expect(run_store.get(handle.id)?.status).toBe("streaming");
    expect(run_store.text_of(handle.id)).toBe("onetwo");

    await transport.channel().end();
    await expect(handle.outcome).resolves.toEqual({
      status: "done",
      text: "onetwo",
      stats: null,
    });
  });

  it("aborts the signal, marks the run aborted and resolves with the text so far", async () => {
    const transport = create_manual_transport();
    const { kernel, run_store } = create_kernel(transport);

    const handle = await kernel.start(run_spec());
    expect(transport.channel().is_waiting()).toBe(true);
    await transport.channel().emit({ type: "text", text: "half a th" });

    kernel.stop(handle.id);

    const request = transport._requests[0];
    expect(request?.signal?.aborted).toBe(true);
    expect(run_store.get(handle.id)?.status).toBe("aborted");
    await expect(handle.outcome).resolves.toEqual({
      status: "aborted",
      text: "half a th",
    });
  });

  it("treats stop on an unknown run as a no-op", () => {
    const { kernel } = create_kernel(create_mock_transport());

    expect(() => {
      kernel.stop("never-started");
    }).not.toThrow();
  });

  it("stops every live run and leaves terminated ones alone", async () => {
    const transport = create_manual_transport();
    const { kernel, run_store } = create_kernel(transport);

    const finished = await kernel.start(run_spec());
    const live = await kernel.start(run_spec());
    await transport.channel(0).end();
    await finished.outcome;

    kernel.stop_all();

    expect(run_store.get(finished.id)?.status).toBe("done");
    expect(run_store.get(live.id)?.status).toBe("aborted");
    await expect(live.outcome).resolves.toEqual({
      status: "aborted",
      text: "",
    });
  });

  it("humanizes a transport error onto the record and the outcome", async () => {
    const raw = "failed to spawn claude";
    const { kernel, run_store } = create_kernel(
      create_mock_transport([{ type: "error", message: raw }]),
    );

    const handle = await kernel.start(run_spec());
    const outcome = await handle.outcome;

    const record = run_store.get(handle.id);
    const humanized = record?.error?.message ?? "";
    expect(record?.status).toBe("error");
    expect(humanized).not.toBe("");
    expect(humanized).not.toBe(raw);
    expect(humanized).toContain(PROVIDER.name);
    // The record keeps both halves: the humanized line a surface shows, and the
    // raw provider text behind a disclosure. Equal values would make the
    // popover's "message not detail" assertion vacuous.
    expect(record?.error?.detail).toBe(raw);
    expect(outcome).toEqual({
      status: "error",
      error: { message: humanized, detail: raw },
      text: "",
    });
  });

  it("isolates a sink that throws so the run and the other sinks continue", async () => {
    const { kernel, run_store } = create_kernel(
      create_mock_transport([{ type: "text", text: "hi" }, { type: "done" }]),
    );
    const healthy_global = create_recording_sink();
    const per_run = create_recording_sink();
    kernel.register_sink({
      on_event() {
        throw new Error("sink exploded");
      },
    });
    kernel.register_sink(healthy_global);

    const handle = await kernel.start(run_spec(), per_run);
    const outcome = await handle.outcome;

    const expected: Received[] = [
      { id: handle.id, event: { type: "text", text: "hi" } },
      { id: handle.id, event: { type: "done" } },
    ];
    expect(healthy_global.received).toEqual(expected);
    expect(per_run.received).toEqual(expected);
    expect(run_store.text_of(handle.id)).toBe("hi");
    expect(outcome).toEqual({ status: "done", text: "hi", stats: null });
  });

  it("fails an agent run with no vault path before touching the transport", async () => {
    const transport = create_mock_transport();
    const { kernel, run_store } = create_kernel(transport, null);
    const sink = create_recording_sink();

    const handle = await kernel.start(agent_spec(), sink);
    const outcome = await handle.outcome;

    expect(transport._requests).toEqual([]);

    const record = run_store.get(handle.id);
    expect(record?.status).toBe("error");
    expect(record?.error?.message).toContain("vault");
    expect(outcome).toMatchObject({ status: "error", text: "" });
    expect(kernel.is_running(handle.id)).toBe(false);
    expect(sink.received).toEqual([
      {
        id: handle.id,
        event: { type: "error", message: record?.error?.message },
      },
    ]);
  });

  it("runs a text-mode run with no vault path", async () => {
    const transport = create_mock_transport([
      { type: "text", text: "no vault needed" },
      { type: "done" },
    ]);
    const { kernel, run_store } = create_kernel(transport, null);

    const handle = await kernel.start(run_spec());

    await expect(handle.outcome).resolves.toEqual({
      status: "done",
      text: "no vault needed",
      stats: null,
    });
    expect(transport._requests[0]?.vault_path).toBeNull();
    expect(run_store.get(handle.id)?.status).toBe("done");
  });

  it("catches a transport that throws mid-iteration and terminates the run", async () => {
    const raw = "connection refused";
    const { kernel, run_store } = create_kernel(create_throwing_transport(raw));

    const handle = await kernel.start(run_spec());
    const outcome = await handle.outcome;

    expect(outcome).toMatchObject({ status: "error", text: "partial" });
    expect(run_store.get(handle.id)?.status).toBe("error");
    expect(run_store.get(handle.id)?.error?.message).toContain(PROVIDER.name);
    expect(kernel.is_running(handle.id)).toBe(false);
  });

  it("keeps concurrent runs independent when one is stopped", async () => {
    const transport = create_manual_transport();
    const { kernel, run_store } = create_kernel(transport);

    const first = await kernel.start(run_spec());
    const second = await kernel.start(run_spec());
    await transport.channel(0).emit({ type: "text", text: "first" });
    await transport.channel(1).emit({ type: "text", text: "second" });

    kernel.stop(first.id);

    expect(run_store.get(first.id)?.status).toBe("aborted");
    expect(run_store.get(second.id)?.status).toBe("streaming");
    expect(kernel.is_running(second.id)).toBe(true);
    expect(run_store.text_of(second.id)).toBe("second");

    await transport.channel(1).end();
    await expect(second.outcome).resolves.toEqual({
      status: "done",
      text: "second",
      stats: null,
    });
  });

  it("reports is_running between start and the terminal event", async () => {
    const transport = create_manual_transport();
    const { kernel } = create_kernel(transport);

    const handle = await kernel.start(run_spec());
    expect(kernel.is_running(handle.id)).toBe(true);

    await transport.channel().emit({ type: "text", text: "working" });
    expect(kernel.is_running(handle.id)).toBe(true);

    await transport.channel().emit({ type: "done" });
    await handle.outcome;

    expect(kernel.is_running(handle.id)).toBe(false);
  });
  // on_end is what lets a sink that owns transcript state close it out. The
  // abort path is the reason it exists: it breaks the loop and dispatches no
  // terminal event, so without on_end a transcript would hang open forever.
  describe("sink close-out", () => {
    it("fires on_end once after the last event when a run completes", async () => {
      const transport = create_mock_transport([
        { type: "text", text: "hi" },
        { type: "done" },
      ]);
      const { kernel } = create_kernel(transport);
      const sink = create_recording_sink();

      const handle = await kernel.start(run_spec(), sink);
      const outcome = await handle.outcome;

      expect(sink.ended).toEqual([{ id: handle.id, outcome }]);
      expect(sink.received.at(-1)?.event).toEqual({ type: "done" });
    });

    it("fires on_end once with the aborted outcome when a run is stopped", async () => {
      const transport = create_manual_transport();
      const { kernel } = create_kernel(transport);
      const sink = create_recording_sink();

      const handle = await kernel.start(run_spec(), sink);
      await transport.channel().emit({ type: "text", text: "half" });
      kernel.stop(handle.id);
      const outcome = await handle.outcome;

      expect(outcome).toEqual({ status: "aborted", text: "half" });
      expect(sink.ended).toEqual([{ id: handle.id, outcome }]);
      expect(sink.received.some((entry) => entry.event.type === "done")).toBe(
        false,
      );
    });

    it("fires on_end once with the error outcome when a run fails", async () => {
      const transport = create_mock_transport([
        { type: "error", message: "boom" },
      ]);
      const { kernel } = create_kernel(transport);
      const sink = create_recording_sink();

      const handle = await kernel.start(run_spec(), sink);
      const outcome = await handle.outcome;

      expect(sink.ended).toHaveLength(1);
      expect(sink.ended[0]?.outcome).toEqual(outcome);
      expect(outcome.status).toBe("error");
    });

    it("fires on_end when no provider resolves", async () => {
      const transport = create_mock_transport();
      const run_store = new AssistantRunStore();
      const kernel = new AssistantKernelService({
        transport,
        probe: create_mock_probe_port(),
        run_store,
        vault_path: () => "/vault",
        providers: () => [],
        default_provider_id: () => "none",
      });
      const sink = create_recording_sink();

      const handle = await kernel.start(make_run_spec(), sink);
      const outcome = await handle.outcome;

      expect(transport._requests).toEqual([]);
      expect(outcome.status).toBe("error");
      expect(sink.ended).toEqual([{ id: handle.id, outcome }]);
    });

    it("fires on_end on a refusal the transport never saw", async () => {
      const transport = create_mock_transport();
      const { kernel } = create_kernel(transport, null);
      const sink = create_recording_sink();

      const handle = await kernel.start(agent_spec(), sink);
      const outcome = await handle.outcome;

      expect(transport._requests).toEqual([]);
      expect(sink.ended).toEqual([{ id: handle.id, outcome }]);
    });

    it("keeps the run going when a sink throws from on_end", async () => {
      const transport = create_mock_transport([{ type: "done" }]);
      const { kernel, run_store } = create_kernel(transport);
      const healthy = create_recording_sink();
      kernel.register_sink({
        on_event: () => {},
        on_end: () => {
          throw new Error("sink exploded");
        },
      });
      kernel.register_sink(healthy);

      const handle = await kernel.start(run_spec());
      await expect(handle.outcome).resolves.toMatchObject({ status: "done" });
      expect(healthy.ended).toHaveLength(1);
      expect(run_store.get(handle.id)?.status).toBe("done");
    });
  });

  // A provider whose args carry {output_file} cannot stream, so the transport
  // runs it one-shot against a note file. Without both paths the Rust side
  // rejects it at the process boundary with an opaque message, so the kernel
  // refuses first with one the user can act on.
  describe("blocking provider pre-flight", () => {
    const blocking = make_provider({
      transport: {
        kind: "cli",
        command: "codex",
        args: ["exec", "--output-last-message", "{output_file}"],
      },
    });

    function blocking_spec(note_path?: string): RunSpec {
      return run_spec({
        provider: blocking,
        request: {
          mode: "text",
          system_prompt: "",
          messages: [{ role: "user", content: "hello" }],
          ...(note_path ? { note_path } : {}),
        },
      });
    }

    it("refuses a blocking run with no vault path before touching the transport", async () => {
      const transport = create_mock_transport();
      const { kernel, run_store } = create_kernel(transport, null);
      const sink = create_recording_sink();

      const handle = await kernel.start(blocking_spec("notes/a.md"), sink);
      const outcome = await handle.outcome;

      expect(transport._requests).toEqual([]);
      expect(outcome.status).toBe("error");
      const record = run_store.get(handle.id);
      expect(record?.status).toBe("error");
      expect(record?.error?.message).toContain("saved note");
      expect(record?.error?.message).not.toContain("see logs for details");
      expect(sink.ended).toHaveLength(1);
    });

    it("refuses a blocking run with no note path", async () => {
      const transport = create_mock_transport();
      const { kernel, run_store } = create_kernel(transport);

      const handle = await kernel.start(blocking_spec());
      const outcome = await handle.outcome;

      expect(transport._requests).toEqual([]);
      expect(outcome.status).toBe("error");
      expect(run_store.get(handle.id)?.error?.message).toContain("saved note");
    });

    it("runs a blocking provider that has both a vault path and a note path", async () => {
      const transport = create_mock_transport([
        { type: "text", text: "answered" },
        { type: "done" },
      ]);
      const { kernel } = create_kernel(transport);

      const handle = await kernel.start(blocking_spec("notes/a.md"));

      await expect(handle.outcome).resolves.toEqual({
        status: "done",
        text: "answered",
        stats: null,
      });
      expect(transport._requests).toHaveLength(1);
    });

    // A streaming provider legitimately has no note to write to.
    it("leaves a streaming provider with no vault path alone", async () => {
      const transport = create_mock_transport([{ type: "done" }]);
      const { kernel } = create_kernel(transport, null);

      const handle = await kernel.start(run_spec());

      await expect(handle.outcome).resolves.toMatchObject({ status: "done" });
      expect(transport._requests).toHaveLength(1);
    });
  });

  // Rust emits the same "aborted" sentinel on both channels. It is a
  // cancellation ack, so humanizing it would show the user a fake failure.
  it("treats the aborted sentinel as cancellation rather than an error", async () => {
    const transport = create_manual_transport();
    const { kernel, run_store } = create_kernel(transport);
    const sink = create_recording_sink();

    const handle = await kernel.start(run_spec(), sink);
    await transport.channel().emit({ type: "text", text: "kept" });
    kernel.stop(handle.id);
    await transport.channel().emit({ type: "error", message: "aborted" });
    const outcome = await handle.outcome;

    expect(outcome).toEqual({ status: "aborted", text: "kept" });
    expect(run_store.get(handle.id)?.error).toBeNull();
    expect(sink.received.some((entry) => entry.event.type === "error")).toBe(
      false,
    );
  });

  // Rust also emits the sentinel when the cancellation did not come from us —
  // a superseded run, a killed process. Reading the outcome off our own signal
  // reports those as "done", which is the abort-reads-as-success class.
  it("treats the aborted sentinel as cancellation even when we never stopped the run", async () => {
    const transport = create_mock_transport([
      { type: "text", text: "kept" },
      { type: "error", message: "aborted" },
    ]);
    const { kernel, run_store } = create_kernel(transport);

    const handle = await kernel.start(run_spec());

    await expect(handle.outcome).resolves.toEqual({
      status: "aborted",
      text: "kept",
    });
    expect(run_store.get(handle.id)?.status).toBe("aborted");
    expect(run_store.get(handle.id)?.error).toBeNull();
  });

  // Contract item (b). Everything here turns on the run existing before the
  // provider does; a gated probe is what makes "during resolution" a moment a
  // test can stand in rather than a race.
  describe("stoppable from the instant it exists", () => {
    function create_gated_probe() {
      let open = () => {};
      const gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      const port: AssistantProviderProbePort & { calls: number } = {
        calls: 0,
        async detect_status(): Promise<AiCliProbeStatus> {
          port.calls += 1;
          await gate;
          return "present";
        },
      };
      return { port, open: () => { open(); } };
    }

    function create_gated_kernel(
      transport: AssistantTransportPort,
      probe: AssistantProviderProbePort,
    ) {
      const run_store = new AssistantRunStore();
      const kernel = new AssistantKernelService({
        transport,
        probe,
        run_store,
        vault_path: () => "/vault",
        providers: () => [PROVIDER],
        default_provider_id: () => PROVIDER.id,
      });
      return { kernel, run_store };
    }

    it("hands back a handle while the provider is still resolving", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(make_run_spec());

      expect(handle.id).toBeTruthy();
      expect(transport._requests).toEqual([]);
      probe.open();
      await handle.outcome;
    });

    it("opens the run record before the provider is known", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel, run_store } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(make_run_spec());

      const record = run_store.get(handle.id);
      expect(record?.status).toBe("starting");
      expect(record?.provider_id).toBeNull();
      probe.open();
      await handle.outcome;
    });

    it("aborts a run stopped during resolution without calling the transport", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel, run_store } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(make_run_spec());
      handle.stop();
      probe.open();

      await expect(handle.outcome).resolves.toEqual({
        status: "aborted",
        text: "",
      });
      expect(transport._requests).toEqual([]);
      expect(run_store.get(handle.id)?.status).toBe("aborted");
    });

    it("closes the sink out once with the aborted outcome and no error event", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel } = create_gated_kernel(transport, probe.port);
      const sink = create_recording_sink();

      const handle = await kernel.start(make_run_spec(), sink);
      handle.stop();
      probe.open();
      await handle.outcome;

      expect(sink.ended).toHaveLength(1);
      expect(sink.ended[0]?.outcome.status).toBe("aborted");
      expect(sink.received).toEqual([]);
    });

    it("records the resolved provider on the run once resolution lands", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel, run_store } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(make_run_spec());
      probe.open();
      await handle.outcome;

      expect(run_store.get(handle.id)?.provider_id).toBe(PROVIDER.id);
    });

    it("skips resolution entirely when the spec carries a provider", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel, run_store } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(run_spec());
      await handle.outcome;

      expect(probe.port.calls).toBe(0);
      expect(run_store.get(handle.id)?.provider_id).toBe(PROVIDER.id);
    });

    it("settles a refusal through the outcome instead of rejecting start", async () => {
      const transport = create_mock_transport();
      const run_store = new AssistantRunStore();
      const kernel = new AssistantKernelService({
        transport,
        probe: create_mock_probe_port(),
        run_store,
        vault_path: () => "/vault",
        providers: () => [],
        default_provider_id: () => "none",
      });

      const handle = await kernel.start(make_run_spec());

      await expect(handle.outcome).resolves.toMatchObject({ status: "error" });
      expect(transport._requests).toEqual([]);
    });

    // A refusal used to settle inside start(); now it settles through the
    // outcome, which is what lets a caller stop one before it lands.
    it("leaves the outcome pending at the moment start returns", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(make_run_spec());
      const winner = await Promise.race([
        handle.outcome.then(() => "settled"),
        Promise.resolve("pending"),
      ]);

      expect(winner).toBe("pending");
      probe.open();
      await handle.outcome;
    });

    it("treats a second stop during resolution as a no-op", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel, run_store } = create_gated_kernel(transport, probe.port);

      const handle = await kernel.start(make_run_spec());
      handle.stop();
      handle.stop();
      probe.open();

      await expect(handle.outcome).resolves.toMatchObject({
        status: "aborted",
      });
      expect(run_store.get(handle.id)?.status).toBe("aborted");
    });

    // Ids are minted before the await, so a run blocked in resolution cannot
    // hand its id to the run started behind it.
    it("mints distinct ids while the first run is blocked in resolution", async () => {
      const transport = create_mock_transport();
      const probe = create_gated_probe();
      const { kernel } = create_gated_kernel(transport, probe.port);

      const first = await kernel.start(make_run_spec());
      const second = await kernel.start(make_run_spec());

      expect(first.id).not.toBe(second.id);
      probe.open();
      await Promise.all([first.outcome, second.outcome]);
    });
  });
});
