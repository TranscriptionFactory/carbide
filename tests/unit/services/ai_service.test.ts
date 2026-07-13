import { describe, expect, it, vi } from "vitest";
import { AiService } from "$lib/features/ai";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { VaultContextSettings } from "$lib/features/ai/domain/ai_types";

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

function create_ai_port() {
  return {
    check_cli: vi.fn().mockResolvedValue(true),
    detect_cli: vi.fn().mockResolvedValue({
      status: "present",
      resolved_path: "/usr/local/bin/claude",
      version: "1.0.0",
      error: null,
    }),
    execute: vi.fn().mockResolvedValue({
      success: true,
      output: "# Updated",
      error: null,
    }),
  };
}

function create_search_port() {
  return {
    find_similar_notes: vi.fn().mockResolvedValue([
      {
        note: {
          id: "1",
          path: "related.md",
          name: "related",
          title: "Related Note",
          blurb: "A related note",
          mtime_ms: 0,
          ctime_ms: 0,
          size_bytes: 100,
          file_type: "md",
        },
        distance: 0.3,
      },
      {
        note: {
          id: "2",
          path: "far.md",
          name: "far",
          title: "Far Note",
          blurb: "Too far away",
          mtime_ms: 0,
          ctime_ms: 0,
          size_bytes: 100,
          file_type: "md",
        },
        distance: 0.8,
      },
    ]),
    get_note_links_snapshot: vi.fn().mockResolvedValue({
      backlinks: [
        {
          id: "3",
          path: "linker.md",
          name: "linker",
          title: "Linker",
          blurb: "Links here",
          mtime_ms: 0,
          ctime_ms: 0,
          size_bytes: 100,
          file_type: "md",
        },
      ],
      outlinks: [
        {
          id: "4",
          path: "target.md",
          name: "target",
          title: "Target",
          blurb: "Linked from here",
          mtime_ms: 0,
          ctime_ms: 0,
          size_bytes: 100,
          file_type: "md",
        },
      ],
      orphan_links: [],
      attachments: [],
    }),
  };
}

const vault_context_settings: VaultContextSettings = {
  enabled: true,
  similar_limit: 5,
  include_links: true,
  similarity_threshold: 0.5,
};

const base_execute_input = {
  provider_config: ollama_config,
  prompt: "Tighten this note",
  mode: "edit" as const,
  timeout_seconds: 120,
  context: {
    kind: "note" as const,
    note_path: as_note_path("docs/demo.md"),
    note_title: "demo",
    note_markdown: as_markdown_text("# Demo"),
    selection: null,
    target: "full_note" as const,
  },
};

describe("AiService", () => {
  it("forwards CLI checks with command string", async () => {
    const ai_port = create_ai_port();
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

    expect(ai_port.detect_cli).toHaveBeenCalledWith({
      command: "/usr/local/bin/claude",
    });
  });

  it("returns true for API providers without checking CLI", async () => {
    const ai_port = create_ai_port();
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
    expect(ai_port.detect_cli).not.toHaveBeenCalled();
  });

  it("builds and executes a full-note request against the active vault", async () => {
    const ai_port = create_ai_port();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ path: "/vault/demo" as never }));
    const service = new AiService(ai_port as never, vault_store);

    const result = await service.execute(base_execute_input);

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

  describe("vault context", () => {
    it("calls find_similar_notes and get_note_links_snapshot when enabled", async () => {
      const ai_port = create_ai_port();
      const search_port = create_search_port();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        ai_port as never,
        vault_store,
        undefined,
        search_port as never,
      );

      await service.execute({
        ...base_execute_input,
        vault_context_settings,
      });

      expect(search_port.find_similar_notes).toHaveBeenCalledWith(
        expect.anything(),
        "docs/demo.md",
        5,
        true,
      );
      expect(search_port.get_note_links_snapshot).toHaveBeenCalledWith(
        expect.anything(),
        "docs/demo.md",
      );
    });

    it("does not call search port when disabled", async () => {
      const ai_port = create_ai_port();
      const search_port = create_search_port();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        ai_port as never,
        vault_store,
        undefined,
        search_port as never,
      );

      await service.execute({
        ...base_execute_input,
        vault_context_settings: { ...vault_context_settings, enabled: false },
      });

      expect(search_port.find_similar_notes).not.toHaveBeenCalled();
      expect(search_port.get_note_links_snapshot).not.toHaveBeenCalled();
    });

    it("silently proceeds when no search port is injected", async () => {
      const ai_port = create_ai_port();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(ai_port as never, vault_store);

      const result = await service.execute({
        ...base_execute_input,
        vault_context_settings,
      });

      expect(result.success).toBe(true);
    });

    it("proceeds with empty context when search port rejects", async () => {
      const ai_port = create_ai_port();
      const search_port = create_search_port();
      search_port.find_similar_notes.mockRejectedValue(
        new Error("Embeddings not ready"),
      );
      search_port.get_note_links_snapshot.mockRejectedValue(
        new Error("Index error"),
      );
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        ai_port as never,
        vault_store,
        undefined,
        search_port as never,
      );

      const result = await service.execute({
        ...base_execute_input,
        vault_context_settings,
      });

      expect(result.success).toBe(true);
      const call = ai_port.execute.mock.calls[0];
      const request = call?.[0] as { prompt: string } | undefined;
      expect(request?.prompt).not.toContain("<similar_notes>");
    });

    it("filters by distance threshold", async () => {
      const ai_port = create_ai_port();
      const search_port = create_search_port();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        ai_port as never,
        vault_store,
        undefined,
        search_port as never,
      );

      await service.execute({
        ...base_execute_input,
        vault_context_settings,
      });

      const call = ai_port.execute.mock.calls[0];
      const request = call?.[0] as { prompt: string } | undefined;
      expect(request?.prompt).toContain("Related Note");
      expect(request?.prompt).not.toContain("Far Note");
    });

    it("only calls find_similar_notes when include_links is false", async () => {
      const ai_port = create_ai_port();
      const search_port = create_search_port();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        ai_port as never,
        vault_store,
        undefined,
        search_port as never,
      );

      await service.execute({
        ...base_execute_input,
        vault_context_settings: {
          ...vault_context_settings,
          include_links: false,
        },
      });

      expect(search_port.find_similar_notes).toHaveBeenCalled();
      expect(search_port.get_note_links_snapshot).not.toHaveBeenCalled();
    });

    it("includes vault context sections in the prompt when context is available", async () => {
      const ai_port = create_ai_port();
      const search_port = create_search_port();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        ai_port as never,
        vault_store,
        undefined,
        search_port as never,
      );

      await service.execute({
        ...base_execute_input,
        vault_context_settings,
      });

      const call = ai_port.execute.mock.calls[0];
      const request = call?.[0] as { prompt: string } | undefined;
      expect(request?.prompt).toContain("<similar_notes>");
      expect(request?.prompt).toContain("<backlinks>");
      expect(request?.prompt).toContain("<outlinks>");
      expect(request?.prompt).toContain(
        "Related notes from the vault are provided for additional context.",
      );
    });
  });
});
