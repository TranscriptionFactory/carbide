import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { AiCliProbeStatus } from "$lib/features/ai";
import type {
  AssistantProviderProbePort,
  AssistantTransportPort,
  RunEvent,
  RunHandle,
  RunId,
  RunOutcome,
  RunRecord,
  RunSink,
  RunSpec,
  TransportRequest,
} from "$lib/features/assistant";

export function make_provider(
  overrides: Partial<AiProviderConfig> = {},
): AiProviderConfig {
  return {
    id: "claude",
    name: "Claude Code",
    transport: { kind: "cli", command: "claude", args: ["-p"] },
    ...overrides,
  };
}

export function make_run_spec(overrides: Partial<RunSpec> = {}): RunSpec {
  return {
    kind: "inline",
    label: "Tighten prose",
    request: {
      mode: "text",
      system_prompt: "",
      messages: [{ role: "user", content: "hello" }],
    },
    ...overrides,
  };
}

export function make_run_record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-1",
    kind: "inline",
    label: "Tighten prose",
    status: "streaming",
    started_at: 0,
    provider_id: "claude",
    provider_session_id: null,
    origin: {},
    error: null,
    stats: null,
    ...overrides,
  };
}

// Yields a scripted event list, then ends. `_requests` records what the kernel
// asked for so a test can assert the request shape without a live backend.
export function create_mock_transport(
  script: RunEvent[] = [{ type: "done" }],
): AssistantTransportPort & {
  _requests: TransportRequest[];
  _script: RunEvent[];
} {
  const mock = {
    _requests: [] as TransportRequest[],
    _script: [...script],
    stream(input: TransportRequest): AsyncIterable<RunEvent> {
      mock._requests.push(input);
      const events = [...mock._script];
      return {
        // eslint-disable-next-line @typescript-eslint/require-await
        async *[Symbol.asyncIterator]() {
          for (const event of events) {
            if (input.signal?.aborted) return;
            yield event;
          }
        },
      };
    },
  };
  return mock;
}

export function create_mock_probe_port(
  statuses: Record<string, AiCliProbeStatus> = {},
): AssistantProviderProbePort & { _checked: string[] } {
  const mock = {
    _checked: [] as string[],
    detect_status(config: AiProviderConfig): Promise<AiCliProbeStatus> {
      mock._checked.push(config.id);
      return Promise.resolve(statuses[config.id] ?? "present");
    },
  };
  return mock;
}

export type MockKernel = {
  start: (spec: RunSpec, sink?: RunSink) => Promise<RunHandle>;
  stop: (id: RunId) => void;
  stop_all: () => void;
  is_running: (id: RunId) => boolean;
  register_sink: (sink: RunSink) => () => void;
  emit: (id: RunId, event: RunEvent) => void;
  _started: RunSpec[];
  _stopped: RunId[];
  _sinks: RunSink[];
};

// UI lanes build against this rather than the real kernel, so presence and the
// runs popover can be tested with no transport and no provider config.
export function create_mock_kernel(): MockKernel {
  let next_id = 0;
  const running = new Set<RunId>();
  const per_run_sinks = new Map<RunId, RunSink>();

  const mock: MockKernel = {
    _started: [],
    _stopped: [],
    _sinks: [],
    start(spec, sink) {
      next_id += 1;
      const id = `run-${String(next_id)}`;
      mock._started.push(spec);
      running.add(id);
      if (sink) per_run_sinks.set(id, sink);
      const outcome: RunOutcome = { status: "done", text: "", stats: null };
      return Promise.resolve({
        id,
        stop: () => {
          mock.stop(id);
        },
        outcome: Promise.resolve(outcome),
      });
    },
    stop(id) {
      mock._stopped.push(id);
      running.delete(id);
    },
    stop_all() {
      for (const id of [...running]) mock.stop(id);
    },
    is_running(id) {
      return running.has(id);
    },
    register_sink(sink) {
      mock._sinks.push(sink);
      return () => {
        mock._sinks = mock._sinks.filter((s) => s !== sink);
      };
    },
    emit(id, event) {
      per_run_sinks.get(id)?.on_event(id, event);
      for (const sink of mock._sinks) sink.on_event(id, event);
    },
  };

  return mock;
}
