import { describe, expect, it } from "vitest";
import {
  AssistantKernelService,
  AssistantRunStore,
  start_run_stream,
  type AssistantTransportPort,
  type RunEvent,
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

async function drain(events: AsyncIterable<RunEvent>): Promise<RunEvent[]> {
  const collected: RunEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
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

      expect(await drain(events)).toEqual([
        { type: "text", text: "hello" },
        { type: "done" },
      ]);
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

      expect(await drain(events)).toEqual([{ type: "text", text: "tail" }]);
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
      expect(collected.at(-1)?.type).toBe("error");
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

      expect(collected.at(-1)?.type).toBe("error");
    },
    DRAIN_TIMEOUT_MS,
  );

  // The abort path breaks the consumer loop and dispatches no terminal event,
  // so on_end is the only thing that can close this queue.
  it(
    "terminates when the run is stopped mid-stream",
    async () => {
      const transport = create_manual_transport();
      const { kernel } = create_kernel(transport);

      const { handle, events } = await start_run_stream(kernel, spec());
      await transport.channel().emit({ type: "text", text: "half" });
      handle.stop();

      expect(await drain(events)).toEqual([{ type: "text", text: "half" }]);
      await expect(handle.outcome).resolves.toEqual({
        status: "aborted",
        text: "half",
      });
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
        expect(collected).toHaveLength(1);
        expect(collected[0]?.type).toBe("error");
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
        expect(collected).toHaveLength(1);
        expect(collected[0]?.type).toBe("error");
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
        expect(collected).toHaveLength(1);
        expect(collected[0]?.type).toBe("error");
      },
      DRAIN_TIMEOUT_MS,
    );
  });
});
