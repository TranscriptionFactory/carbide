import { describe, expect, it } from "vitest";
import {
  agent_backend,
  provider_supports_streaming,
} from "$lib/features/ai/domain/ai_provider_capabilities";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

function api_provider(): AiProviderConfig {
  return {
    id: "lmstudio",
    name: "LM Studio",
    transport: { kind: "api", base_url: "http://localhost:1234/v1" },
  };
}

function cli_provider(args: string[]): AiProviderConfig {
  return {
    id: "cli",
    name: "CLI",
    transport: { kind: "cli", command: "cli", args },
  };
}

describe("provider_supports_streaming", () => {
  it("supports streaming for API providers", () => {
    expect(provider_supports_streaming(api_provider())).toBe(true);
  });

  it("supports streaming for plain CLI providers", () => {
    expect(
      provider_supports_streaming(
        cli_provider(["-p", "--output-format", "text"]),
      ),
    ).toBe(true);
  });

  it("rejects streaming for {output_file} CLI providers", () => {
    expect(
      provider_supports_streaming(
        cli_provider(["exec", "--output-last-message", "{output_file}", "-"]),
      ),
    ).toBe(false);
  });

  it("detects {output_file} embedded inside a larger arg", () => {
    expect(
      provider_supports_streaming(cli_provider(["--out={output_file}"])),
    ).toBe(false);
  });
});

describe("agent_backend", () => {
  it("routes the claude provider to the harness backend", () => {
    const claude = cli_provider(["-p"]);
    claude.id = "claude";
    expect(agent_backend(claude)).toBe("harness");
  });

  it("routes API providers to the native backend", () => {
    expect(agent_backend(api_provider())).toBe("native");
  });

  it("returns null for text-only CLI providers", () => {
    expect(agent_backend(cli_provider(["run", "{model}"]))).toBeNull();
  });
});
