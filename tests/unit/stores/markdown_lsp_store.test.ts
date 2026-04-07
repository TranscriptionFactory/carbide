import { describe, it, expect } from "vitest";
import { MarkdownLspStore } from "$lib/features/markdown_lsp/state/markdown_lsp_store.svelte";
import { markdown_lsp_capabilities } from "$lib/features/markdown_lsp/types";

describe("MarkdownLspStore", () => {
  it("initial status is stopped", () => {
    const store = new MarkdownLspStore();
    expect(store.status).toBe("stopped");
  });

  it("set_status updates status", () => {
    const store = new MarkdownLspStore();
    store.set_status("running");
    expect(store.status).toBe("running");
  });

  it("is_running reflects running status correctly", () => {
    const store = new MarkdownLspStore();
    expect(store.status === "running").toBe(false);
    store.set_status("running");
    expect(store.status === "running").toBe(true);
    store.set_status("starting");
    expect(store.status === "running").toBe(false);
  });

  it("capabilities is null when no provider", () => {
    const store = new MarkdownLspStore();
    expect(store.effective_provider).toBeNull();
    expect(store.capabilities).toBeNull();
  });

  it("capabilities reflects iwes provider", () => {
    const store = new MarkdownLspStore();
    store.set_effective_provider("iwes");
    expect(markdown_lsp_capabilities(store.effective_provider!)).toEqual({
      inlay_hints: true,
      formatting: true,
      transform_actions: true,
    });
  });

  it("capabilities reflects marksman provider", () => {
    const store = new MarkdownLspStore();
    store.set_effective_provider("marksman");
    expect(markdown_lsp_capabilities(store.effective_provider!)).toEqual({
      inlay_hints: false,
      formatting: false,
      transform_actions: false,
    });
  });

  it("reset clears all fields", () => {
    const store = new MarkdownLspStore();
    store.set_status("running");
    store.set_effective_provider("iwes");
    store.set_loading(true);
    store.set_completion_trigger_characters(["["]);

    store.reset();

    expect(store.status).toBe("stopped");
    expect(store.effective_provider).toBeNull();
    expect(store.loading).toBe(false);
    expect(store.completion_trigger_characters).toEqual([]);
  });

  it("set_effective_provider updates effective_provider state", () => {
    const store = new MarkdownLspStore();
    store.set_effective_provider("iwes");
    expect(store.effective_provider).toBe("iwes");
    store.set_effective_provider("marksman");
    expect(store.effective_provider).toBe("marksman");
    store.set_effective_provider(null);
    expect(store.effective_provider).toBeNull();
  });
});
