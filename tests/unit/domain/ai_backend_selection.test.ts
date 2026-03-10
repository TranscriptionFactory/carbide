import { describe, expect, it, vi } from "vitest";
import {
  preferred_ai_backend_order,
  resolve_auto_ai_backend,
} from "$lib/features/ai/domain/ai_backend_selection";

describe("preferred_ai_backend_order", () => {
  it("uses the fixed auto-selection order", () => {
    expect(preferred_ai_backend_order("auto")).toEqual([
      "claude",
      "codex",
      "ollama",
    ]);
  });

  it("returns a single explicit backend when configured", () => {
    expect(preferred_ai_backend_order("codex")).toEqual(["codex"]);
  });
});

describe("resolve_auto_ai_backend", () => {
  it("returns the first available backend in priority order", async () => {
    const check_availability = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await resolve_auto_ai_backend({ check_availability });

    expect(result).toBe("codex");
    expect(check_availability).toHaveBeenNthCalledWith(1, "claude");
    expect(check_availability).toHaveBeenNthCalledWith(2, "codex");
  });

  it("returns null when no backend is available", async () => {
    const result = await resolve_auto_ai_backend({
      check_availability: vi.fn().mockResolvedValue(false),
    });

    expect(result).toBeNull();
  });
});
