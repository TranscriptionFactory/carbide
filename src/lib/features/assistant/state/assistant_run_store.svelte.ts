import { SvelteMap } from "svelte/reactivity";
import type {
  AssistantUserError,
  RunEvent,
  RunId,
  RunRecord,
  RunSpec,
  RunStatus,
} from "$lib/features/assistant/types/run";

const TERMINAL_STATUSES = new Set<RunStatus>(["done", "error", "aborted"]);

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

  get(id: RunId): RunRecord | null {
    return this.runs.get(id) ?? null;
  }

  text_of(id: RunId): string {
    return this.text_by_run.get(id) ?? "";
  }

  start(id: RunId, spec: RunSpec, started_at: number): void {
    this.runs.set(id, {
      id,
      kind: spec.kind,
      label: spec.label,
      status: "starting",
      started_at,
      provider_id: spec.provider?.id ?? null,
      provider_session_id: null,
      origin: spec.origin ?? {},
      error: null,
      stats: null,
    });
    this.text_by_run.set(id, "");
  }

  apply_event(id: RunId, event: RunEvent): void {
    const record = this.runs.get(id);
    if (!record) return;

    switch (event.type) {
      case "session":
        this.amend(record, {
          provider_session_id: event.provider_session_id,
        });
        return;
      case "text":
        this.text_by_run.set(id, this.text_of(id) + event.text);
        this.amend(record, { status: "streaming" });
        return;
      case "reasoning":
        this.amend(record, { status: "streaming" });
        return;
      case "tool_start":
      case "tool_end":
        return;
      case "error":
        this.set_error(id, { message: event.message, detail: event.message });
        return;
      case "done":
        this.amend(record, { status: "done", stats: event.stats ?? null });
        return;
    }
  }

  // The kernel humanizes once and lands the pair here: `message` is what a
  // surface shows, `detail` is the raw provider text behind a disclosure.
  set_error(id: RunId, error: AssistantUserError): void {
    const record = this.runs.get(id);
    if (!record) return;
    this.amend(record, { status: "error", error });
  }

  // The kernel opens a record before it resolves a provider, so the id lands
  // after the fact rather than at start().
  set_provider(id: RunId, provider_id: string): void {
    const record = this.runs.get(id);
    if (!record) return;
    this.amend(record, { provider_id });
  }

  set_status(id: RunId, status: RunStatus): void {
    const record = this.runs.get(id);
    if (!record) return;
    this.amend(record, { status });
  }

  clear_terminated(): void {
    for (const record of [...this.runs.values()]) {
      if (!TERMINAL_STATUSES.has(record.status)) continue;
      this.runs.delete(record.id);
      this.text_by_run.delete(record.id);
    }
  }

  // Records are plain objects inside a SvelteMap, so only a set() is reactive.
  private amend(record: RunRecord, changes: Partial<RunRecord>): void {
    this.runs.set(record.id, { ...record, ...changes });
  }
}
