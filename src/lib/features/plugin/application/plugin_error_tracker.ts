export type ErrorAction = "none" | "warn_user" | "auto_disable";

interface ErrorEntry {
  plugin_id: string;
  timestamp_ms: number;
}

const CONSECUTIVE_ERROR_BUDGET = 10;

export class PluginErrorTracker {
  private entries: Map<string, ErrorEntry[]> = new Map();
  private consecutive_errors: Map<string, number> = new Map();

  constructor(private now_ms: () => number = () => Date.now()) {}

  record_error(plugin_id: string, timestamp_ms: number): ErrorAction {
    const existing = this.entries.get(plugin_id) ?? [];
    const pruned = existing.filter(
      (e) => timestamp_ms - e.timestamp_ms <= 15_000,
    );
    pruned.push({ plugin_id, timestamp_ms });
    this.entries.set(plugin_id, pruned);

    const consecutive = (this.consecutive_errors.get(plugin_id) ?? 0) + 1;
    this.consecutive_errors.set(plugin_id, consecutive);

    if (consecutive >= CONSECUTIVE_ERROR_BUDGET) return "auto_disable";

    const within_5s = pruned.filter(
      (e) => timestamp_ms - e.timestamp_ms <= 5_000,
    ).length;
    const within_15s = pruned.length;

    if (within_15s >= 5) return "auto_disable";
    if (within_5s >= 2) return "warn_user";
    return "none";
  }

  record_success(plugin_id: string): void {
    this.consecutive_errors.set(plugin_id, 0);
  }

  get_consecutive_errors(plugin_id: string): number {
    return this.consecutive_errors.get(plugin_id) ?? 0;
  }

  reset(plugin_id: string): void {
    this.entries.delete(plugin_id);
    this.consecutive_errors.delete(plugin_id);
  }

  clear_all(): void {
    this.entries.clear();
    this.consecutive_errors.clear();
  }
}
