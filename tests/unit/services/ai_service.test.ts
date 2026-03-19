import { describe, expect, it, vi } from "vitest";
import { AiService } from "$lib/features/ai";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";

const ollama_config: AiProviderConfig = {
  id: "ollama",
  name: "Ollama",
  transport: {
    kind: "cli",
    command: "/opt/homebrew/bin/ollama",
    args: ["run", "{model}"],
  },
  model: "llama3:8b",
  install_url: "https://ollama.com",
  is_preset: true,
};

describe("AiService", () => {
  it("forwards CLI checks with command string", async () => {
    const ai_port = {
      check_cli: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
    };
    const vault_store = new VaultStore();
    const service = new AiService(ai_port as never, vault_store);

    await service.check_availability({
      id: "claude",
      name: "Claude Code",
      transport: {
        kind: "cli",
        command: "/usr/local/bin/claude",
        args: ["-p", "{prompt}", "--output-format", "text"],
      },
    });

    expect(ai_port.check_cli).toHaveBeenCalledWith({
      command: "/usr/local/bin/claude",
    });
  });

  it("returns true for API providers without checking CLI", async () => {
    const ai_port = {
      check_cli: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
    };
    const vault_store = new VaultStore();
    const service = new AiService(ai_port as never, vault_store);

    const result = await service.check_availability({
      id: "openai",
      name: "OpenAI",
      transport: {
        kind: "api",
        base_url: "https://api.openai.com/v1",
      },
    });

    expect(result).toBe(true);
    expect(ai_port.check_cli).not.toHaveBeenCalled();
  });

  it("builds and executes a full-note request against the active vault", async () => {
    const ai_port = {
      check_cli: vi.fn().mockResolvedValue(true),
      execute: vi.fn().mockResolvedValue({
        success: true,
        output: "# Updated",
        error: null,
      }),
    };
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
    const service = new AiService(ai_port as never, vault_store);

    const result = await service.execute({
      provider_config: ollama_config,
      prompt: "Tighten this note",
      mode: "edit",
      timeout_seconds: 120,
      context: {
        note_path: as_note_path("docs/demo.md"),
        note_title: "demo",
        note_markdown: as_markdown_text("# Demo"),
        selection: null,
        target: "full_note",
      },
    });

    expect(result.success).toBe(true);
    expect(ai_port.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        provider_config: ollama_config,
        vault_path: "/vault/demo",
        note_path: as_note_path("docs/demo.md"),
        timeout_seconds: 120,
      }),
    );
    const call = ai_port.execute.mock.calls[0];
    const request = call?.[0] as { prompt: string } | undefined;
    expect(request?.prompt).toContain("Tighten this note");
  });
});
