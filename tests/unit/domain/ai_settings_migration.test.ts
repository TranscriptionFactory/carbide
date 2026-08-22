import { describe, expect, it } from "vitest";
import { migrate_ai_settings } from "$lib/features/ai/domain/ai_settings_migration";
import { provider_supports_streaming } from "$lib/features/ai/domain/ai_provider_capabilities";

// A migrated preset carries the preset's whole transport, streaming
// invocation included — spelled out here so the pin stays a real one.
const CLAUDE_STREAM_ARGS = [
  "-p",
  "--output-format",
  "stream-json",
  "--include-partial-messages",
  "--verbose",
  "--strict-mcp-config",
  "--tools",
  "",
];

// A provider list exactly as it was persisted before presets declared a
// streaming invocation: current transport shape, no stream_args.
function stored_before_stream_args(
  transport: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ai_providers: [
      {
        id: "claude",
        name: "Claude Code",
        transport: {
          kind: "cli",
          command: "claude",
          args: ["-p", "--output-format", "text"],
          acp: { kind: "preset", id: "claude" },
          ...transport,
        },
        is_preset: true,
      },
    ],
    ai_default_provider_id: "claude",
  };
}

describe("upgrading a config stored before stream_args existed", () => {
  it("grants streaming to a stored preset that was never customised", () => {
    const result = migrate_ai_settings(stored_before_stream_args());

    expect(result).not.toBeNull();
    const claude = result!.ai_providers[0]!;
    expect(provider_supports_streaming(claude)).toBe(true);
    expect(
      claude.transport.kind === "cli" ? claude.transport.stream_args : null,
    ).toEqual(CLAUDE_STREAM_ARGS);
  });

  it("keeps a customised command and still grants streaming", () => {
    const result = migrate_ai_settings(
      stored_before_stream_args({ command: "/opt/homebrew/bin/claude" }),
    );

    const claude = result!.ai_providers[0]!;
    if (claude.transport.kind !== "cli") throw new Error("expected cli");
    expect(claude.transport.command).toBe("/opt/homebrew/bin/claude");
    expect(claude.transport.stream_args).toEqual(CLAUDE_STREAM_ARGS);
    expect(claude.transport.acp).toEqual({ kind: "preset", id: "claude" });
  });

  // Streaming is declared here, never inferred. Grafting the preset's list onto
  // an invocation the user rewrote would run arguments they never wrote.
  it("adds the preset context window without replacing customised args", () => {
    const result = migrate_ai_settings(
      stored_before_stream_args({ args: ["-p", "--model", "opus"] }),
    );

    expect(result?.ai_providers[0]?.context_window_tokens).toBe(200_000);
    const provider = result?.ai_providers[0];
    expect(
      provider?.transport.kind === "cli" ? provider.transport.args : [],
    ).toEqual(["-p", "--model", "opus"]);
  });

  it("leaves a provider that is not a builtin preset alone", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "my-own-cli",
          name: "Mine",
          transport: { kind: "cli", command: "mine", args: ["-p"] },
        },
      ],
      ai_default_provider_id: "my-own-cli",
    });

    expect(result).toBeNull();
  });

  it("leaves codex alone, because it declares no streaming invocation", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "codex",
          name: "Codex",
          transport: {
            kind: "cli",
            command: "codex",
            args: [
              "exec",
              "--skip-git-repo-check",
              "--output-last-message",
              "{output_file}",
              "-",
            ],
            acp: { kind: "preset", id: "codex" },
          },
        },
      ],
      ai_default_provider_id: "codex",
    });

    expect(result).toBeNull();
  });

  it("is idempotent — a config already carrying stream_args is not rewritten", () => {
    const already = stored_before_stream_args({
      stream_args: ["-p", "--output-format", "stream-json"],
    });
    const provider = (already["ai_providers"] as Record<string, unknown>[])[0];
    if (provider) provider["context_window_tokens"] = 200_000;

    expect(migrate_ai_settings(already)).toBeNull();
  });

  it("adds the declared context window to a stored builtin preset", () => {
    const result = migrate_ai_settings(stored_before_stream_args());

    expect(result?.ai_providers[0]?.context_window_tokens).toBe(200_000);
  });
});

describe("migrate_ai_settings", () => {
  it("converts agent descriptors on cli providers to acp specs and drops the agent key", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "my-claude",
          name: "My Claude",
          transport: { kind: "cli", command: "claude", args: [] },
          agent: { kind: "claude_code" },
        },
        {
          id: "my-codex",
          name: "My Codex",
          transport: { kind: "cli", command: "codex", args: [] },
          agent: { kind: "codex_cli" },
        },
      ],
      ai_default_provider_id: "my-claude",
    });

    expect(result).not.toBeNull();
    expect(result!.ai_default_provider_id).toBe("my-claude");

    const claude = result!.ai_providers.find((p) => p.id === "my-claude");
    expect(claude?.transport).toEqual({
      kind: "cli",
      command: "claude",
      args: [],
      acp: { kind: "preset", id: "claude" },
    });
    expect("agent" in claude!).toBe(false);

    const codex = result!.ai_providers.find((p) => p.id === "my-codex");
    expect(codex?.transport).toEqual({
      kind: "cli",
      command: "codex",
      args: [],
      acp: { kind: "preset", id: "codex" },
    });
    expect("agent" in codex!).toBe(false);
  });

  it("strips text_cli descriptors without adding an acp spec", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "ollama",
          name: "Ollama",
          transport: { kind: "cli", command: "ollama", args: ["run"] },
          agent: { kind: "text_cli" },
        },
      ],
    });

    expect(result).not.toBeNull();
    const ollama = result!.ai_providers[0]!;
    expect(ollama.transport).toEqual({
      kind: "cli",
      command: "ollama",
      args: ["run"],
    });
    expect("agent" in ollama).toBe(false);
  });

  it("strips openai_compat descriptors on api providers, transport unchanged", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "lmstudio",
          name: "LM Studio",
          transport: { kind: "api", base_url: "http://localhost:1234/v1" },
          agent: { kind: "openai_compat" },
        },
      ],
    });

    expect(result).not.toBeNull();
    const lmstudio = result!.ai_providers[0]!;
    expect(lmstudio.transport).toEqual({
      kind: "api",
      base_url: "http://localhost:1234/v1",
    });
    expect("agent" in lmstudio).toBe(false);
  });

  it("strips incoherent descriptors without inventing an acp spec", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "compat-on-cli",
          name: "Compat on CLI",
          transport: { kind: "cli", command: "lms", args: [] },
          agent: { kind: "openai_compat" },
        },
        {
          id: "claude-on-api",
          name: "Claude on API",
          transport: { kind: "api", base_url: "http://localhost:9999/v1" },
          agent: { kind: "claude_code" },
        },
      ],
    });

    expect(result).not.toBeNull();
    const compat = result!.ai_providers.find((p) => p.id === "compat-on-cli");
    expect(compat?.transport).toEqual({
      kind: "cli",
      command: "lms",
      args: [],
    });

    const api = result!.ai_providers.find((p) => p.id === "claude-on-api");
    expect(api?.transport).toEqual({
      kind: "api",
      base_url: "http://localhost:9999/v1",
    });
    for (const provider of result!.ai_providers) {
      expect("agent" in provider).toBe(false);
    }
  });

  it("stamps the acp preset onto descriptor-less claude/codex preset ids", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "claude",
          name: "Claude Code",
          transport: { kind: "cli", command: "claude", args: ["-p"] },
        },
        {
          id: "codex",
          name: "Codex",
          transport: { kind: "cli", command: "codex", args: ["exec"] },
        },
      ],
    });

    expect(result).not.toBeNull();
    const claude = result!.ai_providers.find((p) => p.id === "claude");
    expect(claude?.transport).toEqual({
      kind: "cli",
      command: "claude",
      args: ["-p"],
      acp: { kind: "preset", id: "claude" },
    });

    const codex = result!.ai_providers.find((p) => p.id === "codex");
    expect(codex?.transport).toEqual({
      kind: "cli",
      command: "codex",
      args: ["exec"],
      acp: { kind: "preset", id: "codex" },
    });
  });

  it("converts a persisted harness field to the acp preset spec", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "claude",
          name: "Claude Code",
          transport: {
            kind: "cli",
            command: "claude",
            args: ["-p"],
            harness: "claude",
          },
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.ai_providers[0]?.transport).toEqual({
      kind: "cli",
      command: "claude",
      args: ["-p"],
      acp: { kind: "preset", id: "claude" },
    });
  });

  it("returns null for providers already in the acp shape", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "claude",
          name: "Claude Code",
          transport: {
            kind: "cli",
            command: "claude",
            args: ["-p"],
            acp: { kind: "preset", id: "claude" },
          },
        },
        {
          id: "my-cli",
          name: "My CLI",
          transport: { kind: "cli", command: "mycli", args: [] },
        },
        {
          id: "lmstudio",
          name: "LM Studio",
          transport: { kind: "api", base_url: "http://localhost:1234/v1" },
        },
      ],
    });

    expect(result).toBeNull();
  });

  it("returns null when no legacy fields exist", () => {
    const result = migrate_ai_settings({ some_other_key: "value" });

    expect(result).toBeNull();
  });

  it("migrates legacy fields to provider configs with transport", () => {
    const result = migrate_ai_settings({
      ai_default_backend: "ollama",
      ai_claude_command: "/custom/claude",
      ai_codex_command: "codex",
      ai_ollama_command: "/opt/ollama",
      ai_ollama_model: "llama3:8b",
    });

    expect(result).not.toBeNull();
    expect(result!.ai_default_provider_id).toBe("ollama");
    expect(result!.ai_providers).toHaveLength(7);

    const claude = result!.ai_providers.find((p) => p.id === "claude");
    expect(claude?.transport).toEqual({
      kind: "cli",
      command: "/custom/claude",
      args: ["-p", "--output-format", "text"],
      stream_args: CLAUDE_STREAM_ARGS,
      acp: { kind: "preset", id: "claude" },
    });

    const ollama = result!.ai_providers.find((p) => p.id === "ollama");
    expect(ollama?.transport).toEqual({
      kind: "cli",
      command: "/opt/ollama",
      args: ["run", "{model}"],
      stream_args: ["run", "{model}"],
    });
    expect(ollama?.model).toBe("llama3:8b");
  });

  it("uses preset defaults for empty or missing legacy commands", () => {
    const result = migrate_ai_settings({
      ai_default_backend: "auto",
    });

    expect(result).not.toBeNull();
    expect(result!.ai_default_provider_id).toBe("auto");

    const claude = result!.ai_providers.find((p) => p.id === "claude");
    expect(claude?.transport).toEqual({
      kind: "cli",
      command: "claude",
      args: ["-p", "--output-format", "text"],
      stream_args: CLAUDE_STREAM_ARGS,
      acp: { kind: "preset", id: "claude" },
    });

    const ollama = result!.ai_providers.find((p) => p.id === "ollama");
    expect(ollama?.transport).toEqual({
      kind: "cli",
      command: "ollama",
      args: ["run", "{model}"],
      stream_args: ["run", "{model}"],
    });
    expect(ollama?.model).toBe("qwen3:8b");
  });

  it("preserves preset is_preset flag", () => {
    const result = migrate_ai_settings({
      ai_default_backend: "auto",
    });

    expect(result).not.toBeNull();
    for (const provider of result!.ai_providers) {
      expect(provider.is_preset).toBe(true);
    }
  });

  it("migrates old args_template format to transport format", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "claude",
          name: "Claude Code",
          command: "claude",
          args_template: { kind: "claude" },
          is_preset: true,
        },
        {
          id: "ollama",
          name: "Ollama",
          command: "/custom/ollama",
          args_template: { kind: "ollama" },
          model: "llama3:70b",
          is_preset: true,
        },
        {
          id: "lms",
          name: "LM Studio",
          command: "lms",
          args_template: { kind: "stdin" },
        },
      ],
      ai_default_provider_id: "ollama",
    });

    expect(result).not.toBeNull();
    expect(result!.ai_default_provider_id).toBe("ollama");
    expect(result!.ai_providers).toHaveLength(3);

    const claude = result!.ai_providers.find((p) => p.id === "claude");
    expect(claude?.transport).toEqual({
      kind: "cli",
      command: "claude",
      args: ["-p", "--output-format", "text"],
      stream_args: CLAUDE_STREAM_ARGS,
      acp: { kind: "preset", id: "claude" },
    });

    const ollama = result!.ai_providers.find((p) => p.id === "ollama");
    expect(ollama?.transport).toEqual({
      kind: "cli",
      command: "/custom/ollama",
      args: ["run", "{model}"],
      stream_args: ["run", "{model}"],
    });
    expect(ollama?.model).toBe("llama3:70b");

    const lms = result!.ai_providers.find((p) => p.id === "lms");
    expect(lms?.transport).toEqual({
      kind: "cli",
      command: "lms",
      args: [],
    });
  });
});
