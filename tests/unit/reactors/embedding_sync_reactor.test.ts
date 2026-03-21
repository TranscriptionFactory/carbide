import { describe, expect, it, vi } from "vitest";
import { create_embedding_model_loaded_reactor } from "$lib/reactors/embedding_model_loaded.reactor.svelte";

describe("embedding_model_loaded.reactor", () => {
  it("returns a cleanup function", () => {
    const unmount = create_embedding_model_loaded_reactor(
      { vault: null } as never,
      { embed_sync: vi.fn() } as never,
    );

    expect(typeof unmount).toBe("function");
    unmount();
  });
});
