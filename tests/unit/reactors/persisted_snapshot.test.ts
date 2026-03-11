import { beforeEach, describe, expect, it, vi } from "vitest";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

async function flush_promises() {
  await Promise.resolve();
  await Promise.resolve();
}

describe("create_persisted_snapshot_controller", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("persists only the latest scheduled snapshot", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persist = create_persisted_snapshot_controller({
      delay_ms: 1000,
      serialize: (value: string[]) => JSON.stringify(value),
      save,
    });

    persist.schedule(["a"]);
    persist.schedule(["b"]);

    await vi.advanceTimersByTimeAsync(1000);
    await flush_promises();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(["b"]);
  });

  it("skips resaving an unchanged snapshot after it has been persisted", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persist = create_persisted_snapshot_controller({
      delay_ms: 1000,
      serialize: (value: string[]) => JSON.stringify(value),
      save,
    });

    persist.schedule(["a"]);
    await vi.advanceTimersByTimeAsync(1000);
    await flush_promises();

    persist.schedule(["a"]);
    await vi.advanceTimersByTimeAsync(1000);
    await flush_promises();

    expect(save).toHaveBeenCalledTimes(1);
  });

  it("can force an immediate save for the current snapshot", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persist = create_persisted_snapshot_controller({
      delay_ms: 1000,
      serialize: (value: string[]) => JSON.stringify(value),
      save,
    });

    persist.schedule(["a"]);
    await vi.advanceTimersByTimeAsync(1000);
    await flush_promises();

    persist.persist_now(["a"], { force: true });
    await flush_promises();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, ["a"]);
  });

  it("flushes immediately and can reset dedupe after a scope change", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persist = create_persisted_snapshot_controller({
      delay_ms: 1000,
      serialize: (value: string[]) => JSON.stringify(value),
      save,
    });

    persist.schedule(["a"]);
    persist.flush_pending({ next_saved_serialized: null });
    await flush_promises();

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(["a"]);
    persist.persist_now(["a"]);
    await flush_promises();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, ["a"]);
  });

  it("does not drop pending work when persist_now is unchanged", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const persist = create_persisted_snapshot_controller({
      delay_ms: 1000,
      serialize: (value: string[]) => JSON.stringify(value),
      save,
    });

    persist.schedule(["a"]);
    await vi.advanceTimersByTimeAsync(1000);
    await flush_promises();

    persist.schedule(["b"]);
    persist.persist_now(["a"]);
    await vi.advanceTimersByTimeAsync(1000);
    await flush_promises();

    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenNthCalledWith(2, ["b"]);
  });
});
