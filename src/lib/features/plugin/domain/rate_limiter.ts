export class RateLimitError extends Error {
  constructor(
    public readonly plugin_id: string,
    public readonly limit: number,
    public readonly window_ms: number,
  ) {
    super(
      `Plugin "${plugin_id}" exceeded rate limit (${String(limit)} calls per ${String(window_ms / 1000)}s)`,
    );
    this.name = "RateLimitError";
  }
}

const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60_000;

export class PluginRateLimiter {
  private windows = new Map<string, number[]>();

  constructor(
    private readonly limit: number = DEFAULT_LIMIT,
    private readonly window_ms: number = DEFAULT_WINDOW_MS,
    private readonly now_ms: () => number = () => Date.now(),
  ) {}

  check(plugin_id: string): void {
    const now = this.now_ms();
    const cutoff = now - this.window_ms;

    const timestamps = this.windows.get(plugin_id) ?? [];
    const active = timestamps.filter((t) => t > cutoff);
    active.push(now);
    this.windows.set(plugin_id, active);

    if (active.length > this.limit) {
      throw new RateLimitError(plugin_id, this.limit, this.window_ms);
    }
  }

  reset(plugin_id: string): void {
    this.windows.delete(plugin_id);
  }

  clear_all(): void {
    this.windows.clear();
  }
}
