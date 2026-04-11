import { describe, expect, it } from "vitest";
import {
  PluginRateLimiter,
  RateLimitError,
} from "$lib/features/plugin/domain/rate_limiter";

describe("PluginRateLimiter", () => {
  it("allows calls under the limit", () => {
    const limiter = new PluginRateLimiter(5, 60_000);
    for (let i = 0; i < 5; i++) {
      expect(() => limiter.check("plugin-a")).not.toThrow();
    }
  });

  it("rejects when limit is exceeded", () => {
    const limiter = new PluginRateLimiter(3, 60_000);
    limiter.check("plugin-a");
    limiter.check("plugin-a");
    limiter.check("plugin-a");
    expect(() => limiter.check("plugin-a")).toThrow(RateLimitError);
  });

  it("includes plugin_id in error", () => {
    const limiter = new PluginRateLimiter(1, 60_000);
    limiter.check("my-plugin");
    try {
      limiter.check("my-plugin");
      expect.unreachable("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(RateLimitError);
      expect((e as RateLimitError).plugin_id).toBe("my-plugin");
    }
  });

  it("tracks plugins independently", () => {
    const limiter = new PluginRateLimiter(2, 60_000);
    limiter.check("plugin-a");
    limiter.check("plugin-a");
    expect(() => limiter.check("plugin-b")).not.toThrow();
    expect(() => limiter.check("plugin-a")).toThrow(RateLimitError);
  });

  it("expires old entries outside the window", () => {
    let now = 0;
    const limiter = new PluginRateLimiter(2, 1_000, () => now);
    now = 100;
    limiter.check("plugin-a");
    now = 200;
    limiter.check("plugin-a");
    // Move past the window
    now = 1_200;
    expect(() => limiter.check("plugin-a")).not.toThrow();
  });

  it("reset clears a specific plugin", () => {
    const limiter = new PluginRateLimiter(2, 60_000);
    limiter.check("plugin-a");
    limiter.check("plugin-a");
    limiter.reset("plugin-a");
    expect(() => limiter.check("plugin-a")).not.toThrow();
  });

  it("clear_all resets all plugins", () => {
    const limiter = new PluginRateLimiter(2, 60_000);
    limiter.check("plugin-a");
    limiter.check("plugin-a");
    limiter.check("plugin-b");
    limiter.check("plugin-b");
    limiter.clear_all();
    expect(() => limiter.check("plugin-a")).not.toThrow();
    expect(() => limiter.check("plugin-b")).not.toThrow();
  });
});
