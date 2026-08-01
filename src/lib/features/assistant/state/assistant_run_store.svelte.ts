import { SvelteMap } from "svelte/reactivity";
import type {
  RunEvent,
  RunId,
  RunRecord,
  RunSpec,
  RunStatus,
} from "$lib/features/assistant/types/run";

const NOT_IMPLEMENTED = "AssistantRunStore: not implemented (AU-001)";

// I2: run lifetime is independent of surface lifetime. Records live here until
// they terminate or are explicitly stopped; closing a menu, tab, or panel must
// never remove one.
export class AssistantRunStore {
  runs = new SvelteMap<RunId, RunRecord>();
  text_by_run = new SvelteMap<RunId, string>();

  get all(): RunRecord[] {
    return [...this.runs.values()].sort((a, b) => a.started_at - b.started_at);
  }

  get active(): RunRecord[] {
    return this.all.filter(
      (run) => run.status === "starting" || run.status === "streaming",
    );
  }

  get active_count(): number {
    return this.active.length;
  }

  get has_error(): boolean {
    return this.all.some((run) => run.status === "error");
  }

  get(_id: RunId): RunRecord | null {
    throw new Error(NOT_IMPLEMENTED);
  }

  text_of(_id: RunId): string {
    throw new Error(NOT_IMPLEMENTED);
  }

  start(_id: RunId, _spec: RunSpec, _started_at: number): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  apply_event(_id: RunId, _event: RunEvent): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  set_status(_id: RunId, _status: RunStatus): void {
    throw new Error(NOT_IMPLEMENTED);
  }

  clear_terminated(): void {
    throw new Error(NOT_IMPLEMENTED);
  }
}
