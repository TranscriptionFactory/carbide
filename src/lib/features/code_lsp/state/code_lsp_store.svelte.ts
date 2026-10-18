import { SvelteMap } from "svelte/reactivity";

export class CodeLspStore {
  server_statuses = new SvelteMap<string, string>();
  unavailable_reasons = new SvelteMap<string, string>();

  is_language_running(language: string): boolean {
    return this.server_statuses.get(language) === "running";
  }

  set_status(language: string, status: string) {
    this.server_statuses.set(language, status);
    this.unavailable_reasons.delete(language);
  }

  set_unavailable(language: string, reason: string) {
    this.server_statuses.set(language, "unavailable");
    this.unavailable_reasons.set(language, reason);
  }

  clear() {
    this.server_statuses.clear();
    this.unavailable_reasons.clear();
  }
}
