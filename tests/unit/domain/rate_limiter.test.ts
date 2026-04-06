import { describe, expect, it } from "vitest";
import { PluginRateLimiter } from "$lib/features/plugin/domain/rate_limiter";

describe("PluginRateLimiter", () => {
  it("allows calls within limit", () => {
    const limiter = new PluginRateLimiter(3, 60_000);
    expect(limiter.is_allowed("p1")).toBe(true);
    expect(limiter.is_allowed("p1")).toBe(true);
    expect(limiter.is_allowed("p1")).toBe(true);
  });

  it("rejects calls exceeding limit", () => {
    const limiter = new PluginRateLimiter(2, 60_000);
    limiter.is_allowed("p1");
    limiter.is_allowed("p1");
    expect(limiter.is_allowed("p1")).toBe(false);
  });

  it("tracks plugins independently", () => {
    const limiter = new PluginRateLimiter(1, 60_000);
    limiter.is_allowed("p1");
    expect(limiter.is_allowed("p1")).toBe(false);
    expect(limiter.is_allowed("p2")).toBe(true);
  });

  it("allows calls after window expires", () => {
    let now = 1_000_000;
    const limiter = new PluginRateLimiter(2, 60_000, () => now);
    limiter.is_allowed("p1");
    limiter.is_allowed("p1");
    expect(limiter.is_allowed("p1")).toBe(false);

    now += 61_000;
    expect(limiter.is_allowed("p1")).toBe(true);
  });

  it("prunes old timestamps on check", () => {
    let now = 1_000_000;
    const limiter = new PluginRateLimiter(2, 10_000, () => now);
    limiter.is_allowed("p1");
    limiter.is_allowed("p1");

    now += 11_000;
    expect(limiter.is_allowed("p1")).toBe(true);
    expect(limiter.is_allowed("p1")).toBe(true);
    expect(limiter.is_allowed("p1")).toBe(false);
  });

  it("reset clears a specific plugin", () => {
    const limiter = new PluginRateLimiter(1, 60_000);
    limiter.is_allowed("p1");
    expect(limiter.is_allowed("p1")).toBe(false);

    limiter.reset("p1");
    expect(limiter.is_allowed("p1")).toBe(true);
  });

  it("clear_all resets all plugins", () => {
    const limiter = new PluginRateLimiter(1, 60_000);
    limiter.is_allowed("p1");
    limiter.is_allowed("p2");

    limiter.clear_all();
    expect(limiter.is_allowed("p1")).toBe(true);
    expect(limiter.is_allowed("p2")).toBe(true);
  });

  it("defaults to 100 calls per 60s", () => {
    const limiter = new PluginRateLimiter();
    for (let i = 0; i < 100; i++) {
      expect(limiter.is_allowed("p1")).toBe(true);
    }
    expect(limiter.is_allowed("p1")).toBe(false);
  });
});
