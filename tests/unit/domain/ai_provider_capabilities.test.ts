import { describe, expect, it } from "vitest";
import {
  agent_capability,
  provider_supports_streaming,
} from "$lib/features/ai/domain/ai_provider_capabilities";
import {
  BUILTIN_PROVIDER_PRESETS,
  type AiProviderConfig,
} from "$lib/shared/types/ai_provider_config";

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

describe("agent_capability", () => {
  it("derives the native backend for any api transport", () => {
    expect(agent_capability(api_provider())).toEqual({ backend: "native" });
  });

  it("derives the claude harness from a cli transport naming it", () => {
    const config: AiProviderConfig = {
      id: "custom",
      name: "Custom Claude",
      transport: {
        kind: "cli",
        command: "claude",
        args: [],
        harness: "claude",
      },
    };
    expect(agent_capability(config)).toEqual({
      backend: "harness",
      adapter: "claude",
    });
  });

  it("derives the codex harness from a cli transport naming it", () => {
    const config: AiProviderConfig = {
      id: "custom",
      name: "Custom Codex",
      transport: { kind: "cli", command: "codex", args: [], harness: "codex" },
    };
    expect(agent_capability(config)).toEqual({
      backend: "harness",
      adapter: "codex",
    });
  });

  it("treats a harness-less cli transport as unsupported", () => {
    expect(agent_capability(cli_provider(["run", "{model}"]))).toBeNull();
  });

  it("does not infer capability from a preset id", () => {
    const clone: AiProviderConfig = {
      id: "claude",
      name: "Claude clone",
      transport: { kind: "cli", command: "claude", args: ["-p"] },
    };
    expect(agent_capability(clone)).toBeNull();
  });

  it("derives the expected capability for every builtin preset", () => {
    const expected: Record<string, ReturnType<typeof agent_capability>> = {
      claude: { backend: "harness", adapter: "claude" },
      codex: { backend: "harness", adapter: "codex" },
      ollama: null,
      lmstudio: { backend: "native" },
      "llama-server": { backend: "native" },
    };
    for (const preset of BUILTIN_PROVIDER_PRESETS) {
      expect(agent_capability(preset)).toEqual(expected[preset.id]);
    }
  });
});
