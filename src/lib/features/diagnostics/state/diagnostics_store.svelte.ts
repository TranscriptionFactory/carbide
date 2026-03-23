import { SvelteMap } from "svelte/reactivity";
import type {
  Diagnostic,
  DiagnosticSource,
} from "$lib/features/diagnostics/types/diagnostics";

export class DiagnosticsStore {
  private store = new SvelteMap<
    DiagnosticSource,
    SvelteMap<string, Diagnostic[]>
  >();
  active_file_path = $state<string | null>(null);

  active_sources = $derived.by(() => {
    return Array.from(this.store.keys());
  });

  active_diagnostics = $derived.by(() => {
    if (!this.active_file_path) return [];
    const result: Diagnostic[] = [];
    for (const source_map of this.store.values()) {
      const diags = source_map.get(this.active_file_path);
      if (diags) result.push(...diags);
    }
    return result;
  });

  error_count = $derived.by(() => {
    let count = 0;
    for (const source_map of this.store.values()) {
      for (const diags of source_map.values()) {
        for (const d of diags) {
          if (d.severity === "error") count++;
        }
      }
    }
    return count;
  });

  warning_count = $derived.by(() => {
    let count = 0;
    for (const source_map of this.store.values()) {
      for (const diags of source_map.values()) {
        for (const d of diags) {
          if (d.severity === "warning") count++;
        }
      }
    }
    return count;
  });

  total_count = $derived(this.error_count + this.warning_count);

  push(source: DiagnosticSource, file_path: string, diagnostics: Diagnostic[]) {
    let source_map = this.store.get(source);
    if (!source_map) {
      source_map = new SvelteMap();
      this.store.set(source, source_map);
    }
    if (diagnostics.length === 0) {
      source_map.delete(file_path);
    } else {
      source_map.set(file_path, diagnostics);
    }
  }

  clear_source(source: DiagnosticSource) {
    this.store.delete(source);
  }

  clear_file(source: DiagnosticSource, file_path: string) {
    this.store.get(source)?.delete(file_path);
  }

  set_active_file(path: string | null) {
    this.active_file_path = path;
  }

  reset() {
    this.store.clear();
    this.active_file_path = null;
  }
}
