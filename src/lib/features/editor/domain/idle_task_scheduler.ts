export type IdleScheduler = {
  schedule: (callback: () => void) => number;
  cancel: (handle: number) => void;
};

export type IdleTaskSchedulerOptions = {
  debounce_ms?: number;
  idle?: IdleScheduler;
};

const DEFAULT_DEBOUNCE_MS = 180;

function default_idle_scheduler(): IdleScheduler {
  if (typeof requestIdleCallback === "function") {
    return {
      schedule: (callback) => requestIdleCallback(callback),
      cancel: (handle) => {
        cancelIdleCallback(handle);
      },
    };
  }
  return {
    schedule: (callback) => setTimeout(callback, 0) as unknown as number,
    cancel: (handle) => {
      clearTimeout(handle);
    },
  };
}

// Coalesces rapid rebuilds (outline traversal, markdown serialization):
// debounces bursts of edits, then runs the task during idle time so it never
// blocks a keystroke. Latest task wins; earlier pending tasks are discarded.
export class IdleTaskScheduler {
  private readonly debounce_ms: number;
  private readonly idle: IdleScheduler;
  private debounce_timer: ReturnType<typeof setTimeout> | null = null;
  private idle_handle: number | null = null;
  private pending: (() => void) | null = null;

  constructor(options: IdleTaskSchedulerOptions = {}) {
    this.debounce_ms = options.debounce_ms ?? DEFAULT_DEBOUNCE_MS;
    this.idle = options.idle ?? default_idle_scheduler();
  }

  schedule(build: () => void): void {
    this.pending = build;
    this.clear_idle();
    if (this.debounce_timer !== null) clearTimeout(this.debounce_timer);
    this.debounce_timer = setTimeout(() => {
      this.debounce_timer = null;
      this.run_when_idle();
    }, this.debounce_ms);
  }

  flush(): void {
    if (this.debounce_timer !== null) {
      clearTimeout(this.debounce_timer);
      this.debounce_timer = null;
    }
    this.clear_idle();
    this.run_pending();
  }

  // Drops the pending task without running it; timers are cleared so the
  // scheduler is idle afterwards. The instance stays usable.
  cancel(): void {
    if (this.debounce_timer !== null) {
      clearTimeout(this.debounce_timer);
      this.debounce_timer = null;
    }
    this.clear_idle();
    this.pending = null;
  }

  dispose(): void {
    this.cancel();
  }

  private run_when_idle(): void {
    this.clear_idle();
    this.idle_handle = this.idle.schedule(() => {
      this.idle_handle = null;
      this.run_pending();
    });
  }

  private run_pending(): void {
    const build = this.pending;
    this.pending = null;
    build?.();
  }

  private clear_idle(): void {
    if (this.idle_handle !== null) {
      this.idle.cancel(this.idle_handle);
      this.idle_handle = null;
    }
  }
}
