import { describe, expect, it } from "vitest";
import {
  agent_capability,
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

describe("agent_capability", () => {
  it("maps a claude_code descriptor to the claude harness adapter", () => {
    const claude: AiProviderConfig = {
      id: "custom",
      name: "Custom Claude",
      transport: { kind: "cli", command: "claude", args: [] },
      agent: { kind: "claude_code" },
    };
    expect(agent_capability(claude)).toEqual({
      backend: "harness",
      adapter: "claude",
    });
  });

  it("maps an openai_compat descriptor to the native backend", () => {
    const config: AiProviderConfig = {
      ...api_provider(),
      agent: { kind: "openai_compat" },
    };
    expect(agent_capability(config)).toEqual({ backend: "native" });
  });

  it("treats a codex_cli descriptor as unsupported until an adapter registers", () => {
    const config: AiProviderConfig = {
      ...cli_provider(["exec", "-"]),
      agent: { kind: "codex_cli" },
    };
    expect(agent_capability(config)).toBeNull();
  });

  it("treats a text_cli descriptor as unsupported", () => {
    const config: AiProviderConfig = {
      ...cli_provider(["run", "{model}"]),
      agent: { kind: "text_cli" },
    };
    expect(agent_capability(config)).toBeNull();
  });

  it("infers the harness backend for a descriptor-less claude preset", () => {
    const claude: AiProviderConfig = {
      id: "claude",
      name: "Claude Code",
      transport: {
        kind: "cli",
        command: "claude",
        args: ["-p", "--output-format", "text"],
      },
    };
    expect(agent_capability(claude)).toEqual({
      backend: "harness",
      adapter: "claude",
    });
  });

  it("infers native for descriptor-less api providers", () => {
    expect(agent_capability(api_provider())).toEqual({ backend: "native" });
  });

  it("infers unsupported for descriptor-less custom CLI providers", () => {
    expect(agent_capability(cli_provider(["run", "{model}"]))).toBeNull();
  });
});
