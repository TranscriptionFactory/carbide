import { beforeEach, describe, expect, it, vi } from "vitest";
import { create_debounced_task_controller } from "$lib/reactors/debounced_task";

describe("create_debounced_task_controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("runs only the latest scheduled task", async () => {
    const run = vi.fn();
    const task = create_debounced_task_controller<string>({
      run,
    });

    task.schedule("a", 1000);
    task.schedule("b", 1000);

    await vi.advanceTimersByTimeAsync(1000);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("b");
  });

  it("cancels pending work", async () => {
    const run = vi.fn();
    const task = create_debounced_task_controller<string>({
      run,
    });

    task.schedule("a", 1000);
    task.cancel();

    await vi.advanceTimersByTimeAsync(1000);

    expect(run).not.toHaveBeenCalled();
  });

  it("keeps the first deadline when scheduling if idle", async () => {
    const run = vi.fn();
    const task = create_debounced_task_controller<string>({
      run,
    });

    task.schedule_if_idle("a", 1000);
    await vi.advanceTimersByTimeAsync(900);
    task.schedule_if_idle("b", 1000);
    await vi.advanceTimersByTimeAsync(100);

    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith("a");
  });

  it("arms a fresh deadline once the idle task has run", async () => {
    const run = vi.fn();
    const task = create_debounced_task_controller<string>({
      run,
    });

    task.schedule_if_idle("a", 1000);
    await vi.advanceTimersByTimeAsync(1000);
    task.schedule_if_idle("b", 1000);
    await vi.advanceTimersByTimeAsync(1000);

    expect(run).toHaveBeenCalledTimes(2);
    expect(run).toHaveBeenLastCalledWith("b");
  });
});
