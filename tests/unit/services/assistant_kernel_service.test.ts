import { describe, expect, it } from "vitest";
import {
  AssistantKernelService,
  AssistantRunStore,
  type AssistantTransportPort,
  type RunEvent,
  type RunId,
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

function create_kernel(transport: AssistantTransportPort) {
  const run_store = new AssistantRunStore();
  const kernel = new AssistantKernelService({
    transport,
    probe: create_mock_probe_port(),
    run_store,
    vault_path: () => "/vault",
    providers: () => [PROVIDER],
    default_provider_id: () => PROVIDER.id,
  });
  return { kernel, run_store };
}

type Received = { id: RunId; event: RunEvent };

function create_recording_sink(): RunSink & { received: Received[] } {
  const received: Received[] = [];
  return {
    received,
    on_event(id, event) {
      received.push({ id, event });
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
    await transport.channel().emit({ type: "text", text: "one" });

    unsubscribe();
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
    expect(outcome).toEqual({
      status: "error",
      error: { message: humanized, detail: raw },
      text: "",
    });
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
});
