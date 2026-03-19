import { describe, expect, it, vi } from "vitest";
import {
  preferred_ai_backend_order,
  resolve_auto_ai_backend,
} from "$lib/features/ai/domain/ai_backend_selection";
import { BUILTIN_PROVIDER_PRESETS } from "$lib/shared/types/ai_provider_config";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

describe("preferred_ai_backend_order", () => {
  it("returns all providers in order for auto mode", () => {
    const result = preferred_ai_backend_order("auto", BUILTIN_PROVIDER_PRESETS);
    expect(result.map((p) => p.id)).toEqual(["claude", "codex", "ollama"]);
  });

  it("returns a single explicit provider when configured", () => {
    const result = preferred_ai_backend_order(
      "codex",
      BUILTIN_PROVIDER_PRESETS,
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("codex");
  });

  it("falls back to full list when provider id not found", () => {
    const result = preferred_ai_backend_order(
      "nonexistent",
      BUILTIN_PROVIDER_PRESETS,
    );
    expect(result.map((p) => p.id)).toEqual(["claude", "codex", "ollama"]);
  });

  it("works with custom providers", () => {
    const custom: AiProviderConfig[] = [
      {
        id: "lms",
        name: "LM Studio",
        transport: {
          kind: "cli",
          command: "lms",
          args: ["chat", "{model}"],
        },
        model: "crow-4b-opus-4.6-distill-heretic_qwen3.5",
      },
      ...BUILTIN_PROVIDER_PRESETS,
    ];
    const result = preferred_ai_backend_order("auto", custom);
    expect(result[0]!.id).toBe("lms");
  });
});

describe("resolve_auto_ai_backend", () => {
  it("returns the first available provider in priority order", async () => {
    const check_availability = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    const result = await resolve_auto_ai_backend({
      providers: BUILTIN_PROVIDER_PRESETS,
      check_availability,
    });

    expect(result?.id).toBe("codex");
    expect(check_availability).toHaveBeenCalledTimes(2);
    expect(check_availability.mock.calls[0]![0].id).toBe("claude");
    expect(check_availability.mock.calls[1]![0].id).toBe("codex");
  });

  it("returns null when no provider is available", async () => {
    const result = await resolve_auto_ai_backend({
      providers: BUILTIN_PROVIDER_PRESETS,
      check_availability: vi.fn().mockResolvedValue(false),
    });

    expect(result).toBeNull();
  });

  it("returns null for empty providers list", async () => {
    const result = await resolve_auto_ai_backend({
      providers: [],
      check_availability: vi.fn().mockResolvedValue(true),
    });

    expect(result).toBeNull();
  });
});
