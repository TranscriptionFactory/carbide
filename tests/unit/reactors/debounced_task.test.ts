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
});
