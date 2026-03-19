import type { LintDiagnostic, LintStatus } from "$lib/features/lint/types/lint";
import { SvelteMap } from "svelte/reactivity";

export class LintStore {
  diagnostics_by_file = new SvelteMap<string, LintDiagnostic[]>();
  status = $state<LintStatus>("stopped");
  active_file_path = $state<string | null>(null);

  active_diagnostics = $derived.by(() => {
    if (!this.active_file_path) return [];
    return this.diagnostics_by_file.get(this.active_file_path) ?? [];
  });

  error_count = $derived.by(() => {
    let count = 0;
    for (const diags of this.diagnostics_by_file.values()) {
      for (const d of diags) {
        if (d.severity === "error") count++;
      }
    }
    return count;
  });

  warning_count = $derived.by(() => {
    let count = 0;
    for (const diags of this.diagnostics_by_file.values()) {
      for (const d of diags) {
        if (d.severity === "warning") count++;
      }
    }
    return count;
  });

  total_diagnostic_count = $derived(this.error_count + this.warning_count);

  is_running = $derived(this.status === "running");

  set_diagnostics(path: string, diagnostics: LintDiagnostic[]) {
    if (diagnostics.length === 0) {
      this.diagnostics_by_file.delete(path);
    } else {
      this.diagnostics_by_file.set(path, diagnostics);
    }
  }

  set_status(status: LintStatus) {
    this.status = status;
  }

  set_active_file(path: string | null) {
    this.active_file_path = path;
  }

  clear_diagnostics() {
    this.diagnostics_by_file.clear();
  }

  remove_file(path: string) {
    this.diagnostics_by_file.delete(path);
  }

  reset() {
    this.diagnostics_by_file.clear();
    this.status = "stopped";
    this.active_file_path = null;
  }
}
