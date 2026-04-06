import { describe, expect, it } from "vitest";
import { PluginErrorTracker } from "$lib/features/plugin/application/plugin_error_tracker";

const BASE = 1_000_000;

describe("PluginErrorTracker", () => {
  it("single error returns none", () => {
    const tracker = new PluginErrorTracker();
    const action = tracker.record_error("plugin-a", BASE);
    expect(action).toBe("none");
  });

  it("2 errors within 5 seconds returns warn_user", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    const action = tracker.record_error("plugin-a", BASE + 3_000);
    expect(action).toBe("warn_user");
  });

  it("2 errors more than 5 seconds apart returns none", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    const action = tracker.record_error("plugin-a", BASE + 6_000);
    expect(action).toBe("none");
  });

  it("5 errors within 15 seconds returns auto_disable", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    tracker.record_error("plugin-a", BASE + 2_000);
    tracker.record_error("plugin-a", BASE + 5_000);
    tracker.record_error("plugin-a", BASE + 8_000);
    const action = tracker.record_error("plugin-a", BASE + 11_000);
    expect(action).toBe("auto_disable");
  });

  it("errors older than 15 seconds are pruned", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    tracker.record_error("plugin-a", BASE + 1_000);
    tracker.record_error("plugin-a", BASE + 2_000);
    tracker.record_error("plugin-a", BASE + 3_000);
    // Fifth error arrives >15s after the first four — all prior should be pruned
    // But consecutive count is still 5, which doesn't trigger (budget is 10)
    tracker.record_success("plugin-a");
    const action = tracker.record_error("plugin-a", BASE + 16_000);
    expect(action).toBe("none");
  });

  it("reset clears errors for the specified plugin only", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    tracker.record_error("plugin-b", BASE);
    tracker.reset("plugin-a");

    const action_a = tracker.record_error("plugin-a", BASE + 1_000);
    expect(action_a).toBe("none");

    const action_b = tracker.record_error("plugin-b", BASE + 1_000);
    expect(action_b).toBe("warn_user");
  });

  it("clear_all removes all plugin error histories", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    tracker.record_error("plugin-b", BASE);
    tracker.clear_all();

    expect(tracker.record_error("plugin-a", BASE + 1_000)).toBe("none");
    expect(tracker.record_error("plugin-b", BASE + 1_000)).toBe("none");
  });

  it("10 consecutive errors trigger auto_disable regardless of timing", () => {
    const tracker = new PluginErrorTracker();
    for (let i = 0; i < 9; i++) {
      const action = tracker.record_error("plugin-a", BASE + i * 10_000);
      expect(action).not.toBe("auto_disable");
    }
    const action = tracker.record_error("plugin-a", BASE + 90_000);
    expect(action).toBe("auto_disable");
  });

  it("record_success resets consecutive error counter", () => {
    const tracker = new PluginErrorTracker();
    for (let i = 0; i < 9; i++) {
      tracker.record_error("plugin-a", BASE + i * 10_000);
    }
    tracker.record_success("plugin-a");

    const action = tracker.record_error("plugin-a", BASE + 100_000);
    expect(action).toBe("none");
    expect(tracker.get_consecutive_errors("plugin-a")).toBe(1);
  });

  it("get_consecutive_errors returns current count", () => {
    const tracker = new PluginErrorTracker();
    expect(tracker.get_consecutive_errors("plugin-a")).toBe(0);

    tracker.record_error("plugin-a", BASE);
    expect(tracker.get_consecutive_errors("plugin-a")).toBe(1);

    tracker.record_error("plugin-a", BASE + 10_000);
    expect(tracker.get_consecutive_errors("plugin-a")).toBe(2);

    tracker.record_success("plugin-a");
    expect(tracker.get_consecutive_errors("plugin-a")).toBe(0);
  });

  it("reset clears consecutive errors", () => {
    const tracker = new PluginErrorTracker();
    tracker.record_error("plugin-a", BASE);
    tracker.record_error("plugin-a", BASE + 10_000);
    tracker.reset("plugin-a");
    expect(tracker.get_consecutive_errors("plugin-a")).toBe(0);
  });
});
