import { describe, expect, it, vi } from "vitest";
import { AiService } from "$lib/features/ai";
import { VaultStore } from "$lib/features/vault";
import { create_test_vault } from "../helpers/test_fixtures";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type { VaultContextSettings } from "$lib/features/ai/domain/ai_types";
import type { AiStreamChunk } from "$lib/features/ai/domain/ai_stream_types";
import type { RunEvent } from "$lib/features/assistant";
import { create_test_run_starter } from "../../adapters/test_run_starter";

const inert_starter = () => create_test_run_starter(() => []);

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
    set_api_key: vi.fn().mockResolvedValue(undefined),
    delete_api_key: vi.fn().mockResolvedValue(undefined),
    get_api_key_hint: vi.fn().mockResolvedValue(null),
    test_provider: vi.fn().mockResolvedValue("OK"),
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
    const service = new AiService(
      ai_port as never,
      vault_store,
      inert_starter(),
    );

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
    const service = new AiService(
      ai_port as never,
      vault_store,
      inert_starter(),
    );

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
    const service = new AiService(
      ai_port as never,
      vault_store,
      inert_starter(),
    );

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
        inert_starter(),
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
        inert_starter(),
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
      const service = new AiService(
        ai_port as never,
        vault_store,
        inert_starter(),
      );

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
        inert_starter(),
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
        inert_starter(),
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
        inert_starter(),
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
        inert_starter(),
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

  describe("execute_streaming", () => {
    function starter_of(...events: RunEvent[]) {
      return create_test_run_starter(() => events);
    }

    function create_streaming_service(
      starter: ReturnType<typeof create_test_run_starter>,
    ) {
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      return new AiService(create_ai_port() as never, vault_store, starter);
    }

    it("accumulates text chunks into a successful execution result", async () => {
      const starter = starter_of(
        { type: "text", text: "# Upd" },
        { type: "text", text: "ated\n" },
        { type: "done" },
      );
      const service = create_streaming_service(starter);
      const partials: string[] = [];

      const result = await service.execute_streaming(
        base_execute_input,
        (partial) => partials.push(partial),
      );

      expect(result).toEqual({
        success: true,
        output: "# Updated\n",
        error: null,
      });
      expect(partials.at(-1)).toBe("# Updated\n");
      expect(partials.length).toBeGreaterThan(0);

      const spec = starter.specs[0];
      expect(spec?.kind).toBe("note");
      const request = spec?.request;
      if (request?.mode !== "text") throw new Error("expected a text run");
      expect(request.system_prompt).toBe("");
      expect(request.messages).toHaveLength(1);
      expect(request.messages[0]?.role).toBe("user");
      expect(request.messages[0]?.content).toContain("Tighten this note");
    });

    // The kernel humanizes; this asserts the message survives the service
    // unchanged rather than being re-derived here.
    it("surfaces the kernel error message and keeps partial output", async () => {
      const starter = starter_of(
        { type: "text", text: "Partial draft" },
        {
          type: "error",
          message:
            "Ollama could not reach its backend - check its configuration.",
        },
      );
      const service = create_streaming_service(starter);

      const result = await service.execute_streaming(base_execute_input);

      expect(result.success).toBe(false);
      expect(result.output).toBe("Partial draft");
      expect(result.error).toContain("could not reach its backend");
    });

    it("hands the caller a handle so the run stays stoppable", async () => {
      const starter = starter_of({ type: "text", text: "x" }, { type: "done" });
      const service = create_streaming_service(starter);
      let stoppable = false;

      await service.execute_streaming({
        ...base_execute_input,
        on_run_started: (handle) => {
          stoppable = typeof handle.stop === "function";
        },
      });

      expect(stoppable).toBe(true);
    });

    // Unattended work is a background run so it reaches the runs popover under
    // a label a human wrote, rather than under the internal prompt.
    it("labels an unattended run as background work", async () => {
      const starter = starter_of(
        { type: "text", text: "A tidy summary" },
        { type: "done" },
      );
      const service = create_streaming_service(starter);

      const result = await service.execute_streaming({
        ...base_execute_input,
        run: { kind: "background", label: "Generate description" },
      });

      expect(result.output).toBe("A tidy summary");
      const spec = starter.specs[0];
      expect(spec?.kind).toBe("background");
      expect(spec?.label).toBe("Generate description");
      expect(spec?.origin).toEqual({ note_path: "docs/demo.md" });
    });

    it("flushes joiner remainder when the stream ends without a done chunk", async () => {
      const starter = starter_of({ type: "text", text: "tail [pending" });
      const service = create_streaming_service(starter);

      const result = await service.execute_streaming(base_execute_input);

      expect(result.success).toBe(true);
      expect(result.output).toBe("tail [pending");
    });

    it("accumulates reasoning separately and keeps it out of the output", async () => {
      const starter = starter_of(
        { type: "reasoning", text: "Let me think" },
        { type: "reasoning", text: " harder." },
        { type: "text", text: "# Answer" },
        { type: "done" },
      );
      const service = create_streaming_service(starter);
      const reasoning_partials: string[] = [];

      const result = await service.execute_streaming(
        base_execute_input,
        undefined,
        (partial) => reasoning_partials.push(partial),
      );

      expect(result).toEqual({
        success: true,
        output: "# Answer",
        error: null,
      });
      expect(reasoning_partials).toEqual([
        "Let me think",
        "Let me think harder.",
      ]);
    });
  });

  describe("stream_inline", () => {
    it("drops reasoning chunks silently", async () => {
      const starter = create_test_run_starter(() => [
        { type: "reasoning", text: "<hidden thoughts>" },
        { type: "text", text: "Visible answer" },
        { type: "done" },
      ]);
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({ path: "/vault/demo" as never }),
      );
      const service = new AiService(
        create_ai_port() as never,
        vault_store,
        starter,
      );

      const chunks: AiStreamChunk[] = [];
      for await (const chunk of service.stream_inline({
        provider_config: ollama_config,
        system_prompt: "sys",
        user_prompt: "hi",
      })) {
        chunks.push(chunk);
      }

      expect(chunks).toEqual([
        { type: "text", text: "Visible answer" },
        { type: "done" },
      ]);
    });
  });
});
