import { describe, expect, it } from "vitest";
import { resolve_assistant_provider } from "$lib/features/assistant";
import type {
  AssistantProviderProbePort,
  ProviderResolution,
} from "$lib/features/assistant";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import {
  create_mock_probe_port,
  make_provider,
} from "../helpers/assistant_fixtures";

function resolve_with(
  probe: AssistantProviderProbePort,
  providers: AiProviderConfig[],
  requested_id: string,
) {
  return resolve_assistant_provider({
    providers,
    requested_id,
    detect_status: (config) => probe.detect_status(config),
  });
}

function expect_resolved(result: ProviderResolution) {
  if (result.status !== "resolved") {
    throw new Error(`expected a resolved provider, got: ${result.reason}`);
  }
  return result;
}

function expect_unavailable(result: ProviderResolution) {
  if (result.status !== "unavailable") {
    throw new Error(`expected unavailable, got provider ${result.provider.id}`);
  }
  return result;
}

const claude = make_provider({ id: "claude" });
const codex = make_provider({ id: "codex", name: "Codex" });
const ollama = make_provider({ id: "ollama", name: "Ollama" });

describe("resolve_assistant_provider", () => {
  it("resolves an explicit id to the configured provider without auto", async () => {
    const probe = create_mock_probe_port();

    const result = await resolve_with(probe, [claude, codex], "codex");

    const resolved = expect_resolved(result);
    expect(resolved.provider.id).toBe("codex");
    expect(resolved.was_auto).toBe(false);
  });

  it("never probes when the requested provider is explicit", async () => {
    const probe = create_mock_probe_port({ claude: "missing" });

    await resolve_with(probe, [claude, codex], "claude");

    expect(probe._checked).toEqual([]);
  });

  it("skips a missing provider and picks the present one under auto", async () => {
    const probe = create_mock_probe_port({
      claude: "missing",
      codex: "present",
    });

    const result = await resolve_with(probe, [claude, codex], "auto");

    const resolved = expect_resolved(result);
    expect(resolved.provider.id).toBe("codex");
    expect(resolved.was_auto).toBe(true);
  });

  it("falls back to the first unknown provider when none are present", async () => {
    const probe = create_mock_probe_port({
      claude: "missing",
      codex: "unknown",
      ollama: "missing",
    });

    const result = await resolve_with(probe, [claude, codex, ollama], "auto");

    const resolved = expect_resolved(result);
    expect(resolved.provider.id).toBe("codex");
    expect(resolved.was_auto).toBe(true);
  });

  it("reports unavailable with an actionable reason when every provider is missing", async () => {
    const probe = create_mock_probe_port({
      claude: "missing",
      codex: "missing",
    });

    const result = await resolve_with(probe, [claude, codex], "auto");

    expect(expect_unavailable(result).reason).toMatch(/install/i);
  });

  it("reports unavailable when no providers are configured", async () => {
    const probe = create_mock_probe_port();

    const result = await resolve_with(probe, [], "auto");

    expect(expect_unavailable(result).reason).toMatch(/no ai providers/i);
    expect(probe._checked).toEqual([]);
  });

  it("routes an unknown requested id through the auto walk, not providers[0]", async () => {
    const probe = create_mock_probe_port({
      claude: "missing",
      codex: "present",
    });

    const result = await resolve_with(
      probe,
      [claude, codex],
      "deleted-provider",
    );

    const resolved = expect_resolved(result);
    expect(resolved.provider.id).toBe("codex");
    expect(resolved.was_auto).toBe(true);
  });

  it("treats a rejecting probe as unknown instead of propagating", async () => {
    const probe = {
      detect_status: (config: AiProviderConfig) =>
        config.id === "claude"
          ? Promise.reject(new Error("probe crashed"))
          : Promise.resolve("present" as const),
    };

    const with_fallback = await resolve_with(probe, [claude, codex], "auto");
    expect(expect_resolved(with_fallback).provider.id).toBe("codex");

    const alone = await resolve_with(probe, [claude], "auto");
    expect(expect_resolved(alone).provider.id).toBe("claude");
  });

  it("probes in configured provider order", async () => {
    const probe = create_mock_probe_port({
      claude: "missing",
      codex: "missing",
      ollama: "missing",
    });

    await resolve_with(probe, [ollama, claude, codex], "auto");

    expect(probe._checked).toEqual(["ollama", "claude", "codex"]);
  });

  it("selects on the probe answer alone, never on the provider transport", async () => {
    const lmstudio = make_provider({
      id: "lmstudio",
      name: "LM Studio",
      transport: { kind: "api", base_url: "http://localhost:1234/v1" },
    });
    const probe = create_mock_probe_port({
      lmstudio: "missing",
      codex: "present",
    });

    const result = await resolve_with(probe, [lmstudio, codex], "auto");

    const resolved = expect_resolved(result);
    expect(resolved.provider.id).toBe("codex");
    expect(probe._checked).toEqual(["lmstudio", "codex"]);
  });
});
