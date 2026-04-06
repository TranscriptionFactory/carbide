const DEFAULT_MAX_CALLS = 100;
const DEFAULT_WINDOW_MS = 60_000;

export class PluginRateLimiter {
  private call_timestamps = new Map<string, number[]>();

  constructor(
    private max_calls = DEFAULT_MAX_CALLS,
    private window_ms = DEFAULT_WINDOW_MS,
    private now_ms: () => number = () => Date.now(),
  ) {}

  is_allowed(plugin_id: string): boolean {
    const now = this.now_ms();
    const timestamps = this.call_timestamps.get(plugin_id) ?? [];
    const pruned = timestamps.filter((t) => now - t <= this.window_ms);

    if (pruned.length >= this.max_calls) {
      this.call_timestamps.set(plugin_id, pruned);
      return false;
    }

    pruned.push(now);
    this.call_timestamps.set(plugin_id, pruned);
    return true;
  }

  reset(plugin_id: string): void {
    this.call_timestamps.delete(plugin_id);
  }

  clear_all(): void {
    this.call_timestamps.clear();
  }
}
