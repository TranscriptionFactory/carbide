import { SvelteMap } from "svelte/reactivity";

export class CodeLspStore {
  server_statuses = new SvelteMap<string, string>();

  is_language_running(language: string): boolean {
    return this.server_statuses.get(language) === "running";
  }

  set_status(language: string, status: string) {
    this.server_statuses.set(language, status);
  }

  clear() {
    this.server_statuses.clear();
  }
}
