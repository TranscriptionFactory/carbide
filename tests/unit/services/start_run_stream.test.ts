import { describe, expect, it } from "vitest";
import {
  AssistantKernelService,
  AssistantRunStore,
  start_run_stream,
  type AssistantTransportPort,
  type RunEvent,
  type RunOutcome,
  type RunSpec,
  type RunStreamItem,
} from "$lib/features/assistant";
import {
  create_manual_transport,
  create_mock_probe_port,
  create_mock_transport,
  make_provider,
  make_run_spec,
} from "../helpers/assistant_fixtures";

const PROVIDER = make_provider();

const BLOCKING_PROVIDER = make_provider({
  transport: {
    kind: "cli",
    command: "codex",
    args: ["exec", "--output-last-message", "{output_file}"],
  },
});

// Short enough that a queue which never closes fails the test instead of
// stalling the suite for the default 5s.
const DRAIN_TIMEOUT_MS = 1000;

function create_kernel(
  transport: AssistantTransportPort,
  options: {
    vault_path?: string | null;
    providers?: ReturnType<typeof make_provider>[];
  } = {},
) {
  const run_store = new AssistantRunStore();
  const providers = options.providers ?? [PROVIDER];
  const kernel = new AssistantKernelService({
    transport,
    probe: create_mock_probe_port(),
    run_store,
    vault_path: () =>
      options.vault_path === undefined ? "/vault" : options.vault_path,
    providers: () => providers,
    default_provider_id: () => providers[0]?.id ?? "none",
  });
  return { kernel, run_store };
}

function spec(overrides: Partial<RunSpec> = {}): RunSpec {
  return make_run_spec({ provider: PROVIDER, ...overrides });
}

async function drain(
  events: AsyncIterable<RunStreamItem>,
): Promise<RunStreamItem[]> {
  const collected: RunStreamItem[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

// Contract item (a): the run's outcome is the last thing on the stream, exactly
// once. That pair of facts is what stops an abort from reading as a clean
// finish at any callsite.
function expect_single_end(collected: RunStreamItem[]): RunOutcome {
  const ends = collected.filter((item) => item.type === "end");
  expect(ends).toHaveLength(1);
  expect(collected.at(-1)).toBe(ends[0]);
  const terminal = ends[0];
  if (terminal?.type !== "end") throw new Error("no end item on the stream");
  return terminal.outcome;
}

function events_before_end(collected: RunStreamItem[]): RunStreamItem[] {
  return collected.filter((item) => item.type !== "end");
}

// These drive the real kernel through the real helper with a real `for await`.
// The callsite suites use a fake starter, so if the kernel ever stopped closing
// its sink out, nothing there would notice — the loop would simply never end.
// Every case below hangs rather than fails if on_end is skipped, hence the
// explicit timeouts.
describe("start_run_stream", () => {
  it(
    "terminates the iterable when the run completes normally",
    async () => {
      const transport = create_mock_transport([
        { type: "text", text: "hello" },
        { type: "done" },
      ]);
      const { kernel } = create_kernel(transport);

      const { handle, events } = await start_run_stream(kernel, spec());
      const collected = await drain(events);

      expect(events_before_end(collected)).toEqual([
        { type: "text", text: "hello" },
        { type: "done" },
      ]);
      expect(expect_single_end(collected).status).toBe("done");
      await expect(handle.outcome).resolves.toMatchObject({ status: "done" });
    },
    DRAIN_TIMEOUT_MS,
  );

  it(
    "terminates when the stream ends without a done event",
    async () => {
      const transport = create_mock_transport([{ type: "text", text: "tail" }]);
      const { kernel } = create_kernel(transport);

      const { events } = await start_run_stream(kernel, spec());
      const collected = await drain(events);

      expect(events_before_end(collected)).toEqual([
        { type: "text", text: "tail" },
      ]);
      expect(expect_single_end(collected).status).toBe("done");
    },
    DRAIN_TIMEOUT_MS,
  );

  it(
    "terminates on a provider error, after delivering it",
    async () => {
      const transport = create_mock_transport([
        { type: "text", text: "half" },
        { type: "error", message: "failed to spawn claude" },
      ]);
      const { kernel } = create_kernel(transport);

      const { events } = await start_run_stream(kernel, spec());
      const collected = await drain(events);

      expect(collected[0]).toEqual({ type: "text", text: "half" });
      expect(events_before_end(collected).at(-1)?.type).toBe("error");
      expect(expect_single_end(collected).status).toBe("error");
    },
    DRAIN_TIMEOUT_MS,
  );

  it(
    "terminates when a transport throws mid-iteration",
    async () => {
      const transport: AssistantTransportPort = {
        stream: () => ({
          // eslint-disable-next-line @typescript-eslint/require-await
          async *[Symbol.asyncIterator]() {
            yield { type: "text", text: "partial" } satisfies RunEvent;
            throw new Error("socket died");
          },
        }),
      };
      const { kernel } = create_kernel(transport);

      const { events } = await start_run_stream(kernel, spec());
      const collected = await drain(events);

      expect(events_before_end(collected).at(-1)?.type).toBe("error");
      expect(expect_single_end(collected).status).toBe("error");
    },
    DRAIN_TIMEOUT_MS,
  );

  // The abort path breaks the consumer loop and dispatches no terminal event,
  // so on_end is the only thing that can close this queue — and the only thing
  // that can tell the consumer this was a stop rather than a finish.
  it(
    "terminates when the run is stopped mid-stream, and says so",
    async () => {
      const transport = create_manual_transport();
      const { kernel } = create_kernel(transport);

      const { handle, events } = await start_run_stream(kernel, spec());
      await transport.channel().emit({ type: "text", text: "half" });
      handle.stop();
      const collected = await drain(events);

      expect(events_before_end(collected)).toEqual([
        { type: "text", text: "half" },
      ]);
      expect(expect_single_end(collected)).toEqual({
        status: "aborted",
        text: "half",
      });
      await expect(handle.outcome).resolves.toEqual({
        status: "aborted",
        text: "half",
      });
    },
    DRAIN_TIMEOUT_MS,
  );

  // The cancellation ack can arrive without us having stopped anything.
  it(
    "reports the aborted sentinel as an abort rather than a clean finish",
    async () => {
      const transport = create_mock_transport([
        { type: "text", text: "kept" },
        { type: "error", message: "aborted" },
      ]);
      const { kernel } = create_kernel(transport);

      const { events } = await start_run_stream(kernel, spec());
      const collected = await drain(events);

      expect(expect_single_end(collected)).toEqual({
        status: "aborted",
        text: "kept",
      });
    },
    DRAIN_TIMEOUT_MS,
  );

  it(
    "puts nothing after the end item",
    async () => {
      const transport = create_mock_transport([
        { type: "text", text: "hello" },
        { type: "done" },
      ]);
      const { kernel } = create_kernel(transport);

      const { events } = await start_run_stream(kernel, spec());
      const collected = await drain(events);

      expect(collected.at(-1)?.type).toBe("end");
      expect(collected.filter((item) => item.type === "end")).toHaveLength(1);
    },
    DRAIN_TIMEOUT_MS,
  );

  // AsyncQueue has a single wake slot, so a second iterator would steal from
  // the first. The contract is one consumer; this pins it.
  it(
    "yields nothing to a second iteration of the same stream",
    async () => {
      const transport = create_mock_transport([
        { type: "text", text: "hello" },
        { type: "done" },
      ]);
      const { kernel } = create_kernel(transport);

      const { events } = await start_run_stream(kernel, spec());
      const first = await drain(events);
      const second = await drain(events);

      expect(first.length).toBeGreaterThan(0);
      expect(second).toEqual([]);
    },
    DRAIN_TIMEOUT_MS,
  );

  // The three early returns in start() never reach the consumer loop, so they
  // are the easiest paths on which to forget to close the sink out.
  describe("pre-flight refusals still terminate", () => {
    it(
      "no provider resolved",
      async () => {
        const transport = create_mock_transport();
        const { kernel } = create_kernel(transport, { providers: [] });

        const { events } = await start_run_stream(kernel, make_run_spec());
        const collected = await drain(events);

        expect(transport._requests).toEqual([]);
        expect(events_before_end(collected)).toHaveLength(1);
        expect(collected[0]?.type).toBe("error");
        expect(expect_single_end(collected).status).toBe("error");
      },
      DRAIN_TIMEOUT_MS,
    );

    it(
      "agent run with no vault path",
      async () => {
        const transport = create_mock_transport();
        const { kernel } = create_kernel(transport, { vault_path: null });

        const { events } = await start_run_stream(
          kernel,
          spec({
            kind: "agent",
            request: {
              mode: "agent",
              prompt: "summarize",
              toolset: { kind: "read_only" },
              history: [],
              backend: "native",
            },
          }),
        );
        const collected = await drain(events);

        expect(transport._requests).toEqual([]);
        expect(events_before_end(collected)).toHaveLength(1);
        expect(collected[0]?.type).toBe("error");
        expect(expect_single_end(collected).status).toBe("error");
      },
      DRAIN_TIMEOUT_MS,
    );

    it(
      "blocking provider with nothing to write to",
      async () => {
        const transport = create_mock_transport();
        const { kernel } = create_kernel(transport, { vault_path: null });

        const { events } = await start_run_stream(
          kernel,
          spec({ provider: BLOCKING_PROVIDER }),
        );
        const collected = await drain(events);

        expect(transport._requests).toEqual([]);
        expect(events_before_end(collected)).toHaveLength(1);
        expect(collected[0]?.type).toBe("error");
        expect(expect_single_end(collected).status).toBe("error");
      },
      DRAIN_TIMEOUT_MS,
    );
  });
});
