import { AsyncQueue } from "$lib/shared/utils/async_queue";
import type {
  RunEvent,
  RunHandle,
  RunOutcome,
  RunSpec,
  RunStarter,
} from "$lib/features/assistant/types/run";

// C1 contract item (a): the stream terminates with exactly one `end` item
// carrying the run outcome, so no `for await` consumer can read an abort as a
// clean finish — W0's "abort reads as success" class dies at this layer, not
// per-consumer. `end` exists only here: transports cannot emit it and the run
// store never sees it. Emission + consumer handling land with AU-010; the
// shape is frozen now.
export type RunStreamEnd = { type: "end"; outcome: RunOutcome };

export type RunStreamItem = RunEvent | RunStreamEnd;

export type RunStream = {
  handle: RunHandle;
  events: AsyncIterable<RunStreamItem>;
};

// The kernel pushes into a sink; several callsites read with `for await`. This
// is the single bridge between the two, so they do not each hand-roll a queue —
// and because only `on_end` can close the queue on an aborted run, which
// dispatches no terminal event.
//
// `events` is SINGLE-CONSUMER. AsyncQueue has one wake slot, so a second
// iterator would silently steal events from the first: iterate it in exactly
// one place, and fan out from there rather than iterating twice.
export async function start_run_stream(
  starter: RunStarter,
  spec: RunSpec,
): Promise<RunStream> {
  const queue = new AsyncQueue<RunStreamItem>();
  const handle = await starter.start(spec, {
    on_event: (_id, event) => {
      queue.push(event);
    },
    on_end: (_id, outcome) => {
      queue.push({ type: "end", outcome });
      queue.end();
    },
  });

  return { handle, events: queue };
}
