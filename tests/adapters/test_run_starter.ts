import type {
  RunEvent,
  RunHandle,
  RunOutcome,
  RunSink,
  RunSpec,
  RunStarter,
} from "$lib/features/assistant";

export type TestRunStarter = RunStarter & {
  specs: RunSpec[];
  stop_count: number;
};

type Script = (spec: RunSpec) => AsyncIterable<RunEvent> | RunEvent[];

async function* from_array(events: RunEvent[]): AsyncIterable<RunEvent> {
  for (const event of events) yield event;
}

// Mirrors the kernel's observable contract for callsite tests: events reach the
// sink, `on_end` fires exactly once after the last one, and `stop()` ends the
// run as "aborted" with no terminal event.
export function create_test_run_starter(script: Script): TestRunStarter {
  const starter: TestRunStarter = {
    specs: [],
    stop_count: 0,
    start(spec: RunSpec, sink?: RunSink): Promise<RunHandle> {
      starter.specs.push(spec);

      let stopped = false;
      let text = "";
      const scripted = script(spec);
      const events = Array.isArray(scripted) ? from_array(scripted) : scripted;

      const settle = (outcome: RunOutcome): RunOutcome => {
        sink?.on_end?.("run-1", outcome);
        return outcome;
      };

      const consume = async (): Promise<RunOutcome> => {
        for await (const event of events) {
          if (stopped) break;
          if (event.type === "text") text += event.text;
          sink?.on_event("run-1", event);
          if (event.type === "error") {
            return settle({
              status: "error",
              error: { message: event.message, detail: event.message },
              text,
            });
          }
          if (event.type === "done") {
            return settle({ status: "done", text, stats: event.stats ?? null });
          }
        }
        if (stopped) return settle({ status: "aborted", text });
        return settle({ status: "done", text, stats: null });
      };

      return Promise.resolve({
        id: "run-1",
        stop: () => {
          stopped = true;
          starter.stop_count += 1;
        },
        outcome: consume(),
      });
    },
  };

  return starter;
}
