import { afterEach, describe, expect, it, vi } from "vitest";
import { create_git_auto_fetch_reactor } from "$lib/reactors/git_auto_fetch.reactor.svelte";

describe("git_auto_fetch.reactor", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns a cleanup function", () => {
    const unmount = create_git_auto_fetch_reactor(
      { enabled: true, has_remote: true, sync_status: "idle" } as never,
      {
        editor_settings: {
          git_auto_fetch_interval_minutes: 5,
        },
      } as never,
      { fetch_remote: vi.fn() } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });

  it("does not fetch when the interval is disabled", () => {
    vi.useFakeTimers();
    const fetch_remote = vi.fn();

    const unmount = create_git_auto_fetch_reactor(
      { enabled: true, has_remote: true, sync_status: "idle" } as never,
      {
        editor_settings: {
          git_auto_fetch_interval_minutes: 0,
        },
      } as never,
      { fetch_remote } as never,
    );

    vi.advanceTimersByTime(10 * 60_000);

    expect(fetch_remote).not.toHaveBeenCalled();
    unmount();
  });
});
