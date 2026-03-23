import { describe, it, expect } from "vitest";
import { LintStore } from "$lib/features/lint/state/lint_store.svelte";

describe("LintStore", () => {
  it("starts with stopped status", () => {
    const store = new LintStore();

    expect(store.status).toBe("stopped");
    expect(store.is_running).toBe(false);
  });

  it("is_running is true when status is running", () => {
    const store = new LintStore();
    store.set_status("running");
    expect(store.status).toBe("running");
    expect(store.is_running).toBe(true);
  });

  it("is_running is false when status is starting", () => {
    const store = new LintStore();
    store.set_status("starting");
    expect(store.status).toBe("starting");
    expect(store.is_running).toBe(false);
  });

  it("is_running is false when status is error", () => {
    const store = new LintStore();
    store.set_status({ error: { message: "crash" } });
    expect(store.status).toEqual({ error: { message: "crash" } });
    expect(store.is_running).toBe(false);
  });

  it("is_running is false when status is stopped", () => {
    const store = new LintStore();
    expect(store.status).toBe("stopped");
    expect(store.is_running).toBe(false);
  });

  it("resets to stopped", () => {
    const store = new LintStore();
    store.set_status("running");

    store.reset();

    expect(store.status).toBe("stopped");
    expect(store.is_running).toBe(false);
  });
});
