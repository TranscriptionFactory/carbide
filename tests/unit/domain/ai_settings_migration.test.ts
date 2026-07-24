import { describe, expect, it } from "vitest";
import { migrate_ai_settings } from "$lib/features/ai/domain/ai_settings_migration";

describe("migrate_ai_settings", () => {
  it("returns null when ai_providers already carries agent descriptors", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "claude",
          name: "Claude",
          transport: { kind: "cli", command: "claude", args: [] },
          agent: { kind: "claude_code" },
        },
      ],
    });

    expect(result).toBeNull();
  });

  it("stamps agent descriptors onto transport providers lacking them", () => {
    const result = migrate_ai_settings({
      ai_providers: [
        {
          id: "claude",
          name: "Claude",
          transport: { kind: "cli", command: "claude", args: [] },
        },
        {
          id: "lmstudio",
          name: "LM Studio",
          transport: { kind: "api", base_url: "http://localhost:1234/v1" },
        },
        {
          id: "my-cli",
          name: "My CLI",
          transport: { kind: "cli", command: "mycli", args: [] },
        },
      ],
      ai_default_provider_id: "claude",
    });

    expect(result).not.toBeNull();
    expect(result!.ai_default_provider_id).toBe("claude");

    const claude = result!.ai_providers.find((p) => p.id === "claude");
    expect(claude?.agent).toEqual({ kind: "claude_code" });

    const lmstudio = result!.ai_providers.find((p) => p.id === "lmstudio");
    expect(lmstudio?.agent).toEqual({ kind: "openai_compat" });

    const custom = result!.ai_providers.find((p) => p.id === "my-cli");
    expect(custom?.agent).toEqual({ kind: "text_cli" });
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
    expect(result!.ai_providers).toHaveLength(5);

    const claude = result!.ai_providers.find((p) => p.id === "claude");
    expect(claude?.transport).toEqual({
      kind: "cli",
      command: "/custom/claude",
      args: ["-p", "--output-format", "text"],
    });

    const ollama = result!.ai_providers.find((p) => p.id === "ollama");
    expect(ollama?.transport).toEqual({
      kind: "cli",
      command: "/opt/ollama",
      args: ["run", "{model}"],
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
    });

    const ollama = result!.ai_providers.find((p) => p.id === "ollama");
    expect(ollama?.transport).toEqual({
      kind: "cli",
      command: "ollama",
      args: ["run", "{model}"],
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
    expect(claude?.transport.kind).toBe("cli");

    const ollama = result!.ai_providers.find((p) => p.id === "ollama");
    expect(ollama?.transport).toEqual({
      kind: "cli",
      command: "/custom/ollama",
      args: ["run", "{model}"],
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
