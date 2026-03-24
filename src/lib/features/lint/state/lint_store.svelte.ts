import type { LintStatus } from "$lib/features/lint/types/lint";

export class LintStore {
  status = $state<LintStatus>("stopped");

  is_running = $derived(this.status === "running");

  set_status(status: LintStatus) {
    this.status = status;
  }

  reset() {
    this.status = "stopped";
  }
}
