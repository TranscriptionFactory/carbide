import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  IdleTaskScheduler,
  type IdleScheduler,
} from "$lib/features/editor/domain/idle_task_scheduler";

function synchronous_idle(): IdleScheduler {
  return {
    schedule: (callback) => {
      callback();
      return 0;
    },
    cancel: () => {},
  };
}

describe("IdleTaskScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of builds into a single run after the debounce window", () => {
    const run = vi.fn();
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    scheduler.schedule(run);
    scheduler.schedule(run);
    scheduler.schedule(run);
    expect(run).not.toHaveBeenCalled();

    vi.advanceTimersByTime(180);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("runs only the latest build scheduled within one window", () => {
    const first = vi.fn();
    const second = vi.fn();
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    scheduler.schedule(first);
    scheduler.schedule(second);
    vi.advanceTimersByTime(180);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("does not run before the debounce window elapses", () => {
    const run = vi.fn();
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    scheduler.schedule(run);
    vi.advanceTimersByTime(179);
    expect(run).not.toHaveBeenCalled();
  });

  it("flush runs the pending build immediately and cancels the debounce", () => {
    const run = vi.fn();
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    scheduler.schedule(run);
    scheduler.flush();
    expect(run).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(180);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("cancel drops the pending build and the scheduler stays usable", () => {
    const first = vi.fn();
    const second = vi.fn();
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    scheduler.schedule(first);
    scheduler.cancel();
    vi.advanceTimersByTime(180);
    expect(first).not.toHaveBeenCalled();

    scheduler.schedule(second);
    vi.advanceTimersByTime(180);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("flush with nothing pending is a no-op", () => {
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    expect(() => {
      scheduler.flush();
    }).not.toThrow();
  });

  it("dispose cancels a pending build", () => {
    const run = vi.fn();
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: synchronous_idle(),
    });

    scheduler.schedule(run);
    scheduler.dispose();
    vi.advanceTimersByTime(180);
    expect(run).not.toHaveBeenCalled();
  });

  it("runs the build through the idle scheduler after the debounce", () => {
    const run = vi.fn();
    const idle_schedule = vi.fn((callback: () => void) => {
      callback();
      return 7;
    });
    const scheduler = new IdleTaskScheduler({
      debounce_ms: 180,
      idle: { schedule: idle_schedule, cancel: vi.fn() },
    });

    scheduler.schedule(run);
    vi.advanceTimersByTime(180);

    expect(idle_schedule).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
