import { describe, expect, it, vi } from "vitest";
import { AiService } from "$lib/features/ai";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

describe("AiService", () => {
  it("forwards CLI checks with command overrides", async () => {
    const ai_port = {
      check_cli: vi.fn().mockResolvedValue(true),
      execute: vi.fn(),
    };
    const vault_store = new VaultStore();
    const service = new AiService(ai_port as never, vault_store);

    await service.check_cli("claude", "/usr/local/bin/claude");

    expect(ai_port.check_cli).toHaveBeenCalledWith({
      provider: "claude",
      command: "/usr/local/bin/claude",
    });
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
      provider: "ollama",
      prompt: "Tighten this note",
      command: "/opt/homebrew/bin/ollama",
      ollama_model: "llama3:8b",
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
        provider: "ollama",
        vault_path: "/vault/demo",
        note_path: as_note_path("docs/demo.md"),
        command: "/opt/homebrew/bin/ollama",
        ollama_model: "llama3:8b",
        timeout_seconds: 120,
      }),
    );
    const call = ai_port.execute.mock.calls[0];
    const request = call?.[0] as { prompt: string } | undefined;
    expect(request?.prompt).toContain("Tighten this note");
  });
});
