import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  announce,
  live_announcer,
} from "$lib/shared/a11y/live_announcer.svelte";

describe("live_announcer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    announce("reset");
    vi.runAllTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears the region before setting the new message", () => {
    announce("Note saved");
    expect(live_announcer.message).toBe("");
    vi.runAllTimers();
    expect(live_announcer.message).toBe("Note saved");
  });

  it("re-announces an identical message via clear-then-set", () => {
    announce("Note saved");
    vi.runAllTimers();
    announce("Note saved");
    expect(live_announcer.message).toBe("");
    vi.runAllTimers();
    expect(live_announcer.message).toBe("Note saved");
  });

  it("collapses rapid successive announcements to the latest", () => {
    announce("first");
    announce("second");
    vi.runAllTimers();
    expect(live_announcer.message).toBe("second");
  });

  it("ignores empty and whitespace-only messages", () => {
    announce("kept");
    vi.runAllTimers();
    announce("");
    announce("   ");
    vi.runAllTimers();
    expect(live_announcer.message).toBe("kept");
  });

  it("trims announced messages", () => {
    announce("  padded  ");
    vi.runAllTimers();
    expect(live_announcer.message).toBe("padded");
  });
});
