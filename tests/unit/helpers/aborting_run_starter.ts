import type {
  RunEvent,
  RunHandle,
  RunOutcome,
  RunSink,
  RunSpec,
  RunStarter,
} from "$lib/features/assistant";

export type AbortingRunStarter = RunStarter & { specs: RunSpec[] };

// A run the user stopped, as a callsite sees it: the events that made it
// through, then on_end carrying the aborted outcome and no terminal event.
// The real kernel path is covered end to end in start_run_stream.test.ts; this
// keeps consumer suites free of abort timing they would otherwise have to race.
export function create_aborting_run_starter(
  events: RunEvent[] = [],
): AbortingRunStarter {
  const starter: AbortingRunStarter = {
    specs: [],
    start(spec: RunSpec, sink?: RunSink): Promise<RunHandle> {
      starter.specs.push(spec);

      let text = "";
      const settle = (): RunOutcome => {
        for (const event of events) {
          if (event.type === "text") text += event.text;
          sink?.on_event("run-1", event);
        }
        const outcome: RunOutcome = { status: "aborted", text };
        sink?.on_end?.("run-1", outcome);
        return outcome;
      };

      return Promise.resolve({
        id: "run-1",
        stop: () => {},
        outcome: Promise.resolve(settle()),
      });
    },
  };

  return starter;
}
