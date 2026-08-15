import { describe, expect, it } from "vitest";
import {
  agent_capability,
  provider_supports_streaming,
  with_transport_kind,
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

function cli_provider(
  args: string[],
  stream_args?: string[],
): AiProviderConfig {
  return {
    id: "cli",
    name: "CLI",
    transport: {
      kind: "cli",
      command: "cli",
      args,
      ...(stream_args ? { stream_args } : {}),
    },
  };
}

function preset(id: string): AiProviderConfig {
  const found = BUILTIN_PROVIDER_PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`no builtin preset ${id}`);
  return found;
}

describe("provider_supports_streaming", () => {
  it("supports streaming for API providers", () => {
    expect(provider_supports_streaming(api_provider())).toBe(true);
  });

  it("streams a CLI that declares streaming args", () => {
    expect(
      provider_supports_streaming(
        cli_provider(
          ["-p", "--output-format", "text"],
          ["-p", "--output-format", "stream-json"],
        ),
      ),
    ).toBe(true);
  });

  // The old rule read the absence of an {output_file} placeholder as proof of
  // streaming, which classified a buffered-until-exit output format as
  // streaming and left the panel on a spinner for the whole run.
  it("does not stream a CLI that declares no streaming args", () => {
    expect(
      provider_supports_streaming(
        cli_provider(["-p", "--output-format", "text"]),
      ),
    ).toBe(false);
  });

  it("does not stream a {output_file} CLI, which declares none", () => {
    expect(
      provider_supports_streaming(
        cli_provider(["exec", "--output-last-message", "{output_file}", "-"]),
      ),
    ).toBe(false);
  });
});

describe("builtin preset streaming declarations", () => {
  it.each([
    ["claude", true],
    ["ollama", true],
    ["opencode", true],
    ["pi", true],
    ["codex", false],
  ])("preset %s streams: %s", (id, streams) => {
    expect(provider_supports_streaming(preset(id))).toBe(streams);
  });

  // Inline generation and the agentic edit runner read `args`, never
  // `stream_args`. Changing how ask mode streams must not reach them.
  it("leaves the Claude preset's one-shot args untouched", () => {
    const transport = preset("claude").transport;
    if (transport.kind !== "cli") throw new Error("expected a cli transport");

    expect(transport.args).toEqual(["-p", "--output-format", "text"]);
    expect(transport.args).not.toContain("stream-json");
  });

  // Ask mode answers from the retrieved context it was handed; a full-toolset
  // agent rooted in the vault is what made the turn take minutes.
  it("strips every tool from the Claude preset's streaming args", () => {
    const transport = preset("claude").transport;
    if (transport.kind !== "cli") throw new Error("expected a cli transport");

    expect(transport.stream_args).toEqual([
      "-p",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--verbose",
      "--strict-mcp-config",
      "--tools",
      "",
    ]);
    expect(transport.stream_args?.at(-1)).toBe("");
  });
});

describe("agent_capability", () => {
  it("derives the native backend for any api transport", () => {
    expect(agent_capability(api_provider())).toEqual({ backend: "native" });
  });

  it("derives the acp backend from a cli transport naming a preset agent", () => {
    const config: AiProviderConfig = {
      id: "custom",
      name: "Custom Claude",
      transport: {
        kind: "cli",
        command: "claude",
        args: [],
        acp: { kind: "preset", id: "claude" },
      },
    };
    expect(agent_capability(config)).toEqual({
      backend: "acp",
      acp: { kind: "preset", id: "claude" },
    });
  });

  it("derives the acp backend from a custom agent command", () => {
    const config: AiProviderConfig = {
      id: "custom",
      name: "Custom ACP",
      transport: {
        kind: "cli",
        command: "codex",
        args: [],
        acp: { kind: "custom", command: "my-agent", args: ["--stdio"] },
      },
    };
    expect(agent_capability(config)).toEqual({
      backend: "acp",
      acp: { kind: "custom", command: "my-agent", args: ["--stdio"] },
    });
  });

  it("treats an acp-less cli transport as unsupported", () => {
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
      claude: { backend: "acp", acp: { kind: "preset", id: "claude" } },
      codex: { backend: "acp", acp: { kind: "preset", id: "codex" } },
      opencode: { backend: "acp", acp: { kind: "preset", id: "opencode" } },
      pi: { backend: "acp", acp: { kind: "preset", id: "pi" } },
      ollama: null,
      lmstudio: { backend: "native" },
      "llama-server": { backend: "native" },
    };
    for (const preset of BUILTIN_PROVIDER_PRESETS) {
      expect(agent_capability(preset)).toEqual(expected[preset.id]);
    }
  });
});

describe("with_transport_kind", () => {
  it("converts an API provider to CLI with blank command and args", () => {
    expect(with_transport_kind(api_provider(), "cli").transport).toEqual({
      kind: "cli",
      command: "",
      args: [],
    });
  });

  it("converts a CLI provider to API with a blank base_url", () => {
    expect(with_transport_kind(cli_provider([]), "api").transport).toEqual({
      kind: "api",
      base_url: "",
    });
  });

  it("drops the api_key_env when leaving the API transport", () => {
    const config: AiProviderConfig = {
      id: "lmstudio",
      name: "LM Studio",
      transport: {
        kind: "api",
        base_url: "http://localhost:1234/v1",
        api_key_env: "OPENAI_API_KEY",
      },
    };
    expect(with_transport_kind(config, "cli").transport).not.toHaveProperty(
      "api_key_env",
    );
  });

  // agent_capability() only reads transport.acp for the cli transport, so an acp
  // spec carried onto an api provider would be unreachable state.
  it("drops the acp spec when converting CLI to API", () => {
    const config: AiProviderConfig = {
      id: "custom",
      name: "Custom",
      transport: {
        kind: "cli",
        command: "claude",
        args: [],
        acp: { kind: "preset", id: "claude" },
      },
    };
    expect(with_transport_kind(config, "api").transport).not.toHaveProperty(
      "acp",
    );
  });

  it("is identity when the kind is unchanged, keeping the acp spec", () => {
    const config: AiProviderConfig = {
      id: "custom",
      name: "Custom",
      transport: {
        kind: "cli",
        command: "claude",
        args: ["--flag"],
        acp: { kind: "preset", id: "claude" },
      },
    };
    expect(with_transport_kind(config, "cli")).toBe(config);
  });

  it("preserves fields outside the transport", () => {
    const config: AiProviderConfig = {
      ...api_provider(),
      model: "qwen3",
      install_url: "https://example.test",
    };
    const next = with_transport_kind(config, "cli");
    expect(next.id).toBe("lmstudio");
    expect(next.name).toBe("LM Studio");
    expect(next.model).toBe("qwen3");
    expect(next.install_url).toBe("https://example.test");
  });

  it("does not mutate the input config", () => {
    const config = api_provider();
    with_transport_kind(config, "cli");
    expect(config.transport).toEqual({
      kind: "api",
      base_url: "http://localhost:1234/v1",
    });
  });

  it("round-trips back to a usable transport of the original kind", () => {
    const there = with_transport_kind(api_provider(), "cli");
    const back = with_transport_kind(there, "api");
    expect(back.transport).toEqual({ kind: "api", base_url: "" });
  });

  // The reason this helper exists: agent_capability() gates acp on the cli
  // transport, so a provider created as api had no route to acp capability at
  // all short of delete-and-recreate.
  it("unblocks acp capability for a provider created as api", () => {
    const created_as_api = api_provider();
    expect(agent_capability(created_as_api)).toEqual({ backend: "native" });

    const converted = with_transport_kind(created_as_api, "cli");
    expect(agent_capability(converted)).toBeNull();

    expect(converted.transport.kind).toBe("cli");
    const with_acp: AiProviderConfig = {
      ...converted,
      transport: {
        kind: "cli",
        command: "",
        args: [],
        acp: { kind: "preset", id: "claude" },
      },
    };
    expect(agent_capability(with_acp)).toEqual({
      backend: "acp",
      acp: { kind: "preset", id: "claude" },
    });
  });
});
