import { AsyncQueue } from "$lib/shared/utils/async_queue";
import type {
  RunEvent,
  RunHandle,
  RunSpec,
  RunStarter,
} from "$lib/features/assistant/types/run";

export type RunStream = {
  handle: RunHandle;
  events: AsyncIterable<RunEvent>;
};

// The kernel pushes into a sink; several callsites read with `for await`. This
// is the single bridge between the two, so they do not each hand-roll a queue —
// and because only `on_end` can close the queue on an aborted run, which
// dispatches no terminal event.
export async function start_run_stream(
  starter: RunStarter,
  spec: RunSpec,
): Promise<RunStream> {
  const queue = new AsyncQueue<RunEvent>();
  const handle = await starter.start(spec, {
    on_event: (_id, event) => {
      queue.push(event);
    },
    on_end: () => {
      queue.end();
    },
  });

  return { handle, events: queue };
}
