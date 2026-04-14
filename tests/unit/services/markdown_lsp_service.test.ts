import { describe, expect, it, vi } from "vitest";
import { MarkdownLspService } from "$lib/features/markdown_lsp/application/markdown_lsp_service";
import { MarkdownLspStore } from "$lib/features/markdown_lsp/state/markdown_lsp_store.svelte";
import { DiagnosticsStore } from "$lib/features/diagnostics/state/diagnostics_store.svelte";
import { VaultStore } from "$lib/features/vault/state/vault_store.svelte";
import type { MarkdownLspPort } from "$lib/features/markdown_lsp/ports";
import type {
  MarkdownLspDiagnosticsEvent,
  MarkdownLspStatusEvent,
} from "$lib/features/markdown_lsp/types";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import { create_test_vault } from "../helpers/test_fixtures";

function create_mock_port() {
  let diagnostics_callback:
    | ((event: MarkdownLspDiagnosticsEvent) => void)
    | null = null;
  let status_callback: ((event: MarkdownLspStatusEvent) => void) | null = null;

  const port: MarkdownLspPort = {
    start: vi.fn().mockResolvedValue({
      completion_trigger_characters: ["["],
      effective_provider: "marksman",
      server_capabilities: {
        hover: true,
        completion: true,
        references: true,
        definition: true,
        code_actions: false,
        rename: false,
        formatting: false,
        inlay_hints: false,
        workspace_symbols: false,
        document_symbols: true,
      },
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    did_open: vi.fn().mockResolvedValue(undefined),
    did_change: vi.fn().mockResolvedValue(undefined),
    did_save: vi.fn().mockResolvedValue(undefined),
    did_close: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue({ contents: null }),
    references: vi.fn().mockResolvedValue([]),
    definition: vi.fn().mockResolvedValue([]),
    code_actions: vi.fn().mockResolvedValue([]),
    code_action_resolve: vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    }),
    workspace_symbols: vi.fn().mockResolvedValue([]),
    rename: vi.fn().mockResolvedValue({
      files_created: [],
      files_deleted: [],
      files_modified: [],
      errors: [],
    }),
    prepare_rename: vi.fn().mockResolvedValue(null),
    completion: vi.fn().mockResolvedValue([]),
    formatting: vi.fn().mockResolvedValue([]),
    inlay_hints: vi.fn().mockResolvedValue([]),
    document_symbols: vi.fn().mockResolvedValue([]),
    subscribe_diagnostics: vi.fn().mockImplementation((callback) => {
      diagnostics_callback = callback;
      return () => {};
    }),
    subscribe_status: vi.fn().mockImplementation((callback) => {
      status_callback = callback;
      return () => {};
    }),
    iwe_config_status: vi.fn().mockResolvedValue({
      exists: false,
      config_url: "",
      config_path: "",
      action_count: 0,
      action_names: [],
      actions: [],
    }),
    iwe_config_reset: vi.fn().mockResolvedValue(undefined),
    iwe_config_rewrite_provider: vi.fn().mockResolvedValue(undefined),
    lsp_config_status: vi.fn().mockResolvedValue({
      has_config: false,
      exists: false,
      config_path: "",
    }),
    lsp_config_reset: vi.fn().mockResolvedValue(undefined),
  };

  return {
    port,
    emit_diagnostics(event: MarkdownLspDiagnosticsEvent) {
      diagnostics_callback?.(event);
    },
    emit_status(event: MarkdownLspStatusEvent) {
      status_callback?.(event);
    },
  };
}

describe("MarkdownLspService", () => {
  const iwe_provider_config: AiProviderConfig = {
    id: "claude",
    name: "Claude Code",
    transport: {
      kind: "cli",
      command: "claude",
      args: ["-p", "{prompt}"],
    },
    model: "sonnet",
  };

  it("replaces existing listeners before subscribing again", async () => {
    const { port } = create_mock_port();
    const diagnostics_unsubscribe_1 = vi.fn();
    const diagnostics_unsubscribe_2 = vi.fn();
    const status_unsubscribe_1 = vi.fn();
    const status_unsubscribe_2 = vi.fn();

    vi.mocked(port.subscribe_diagnostics)
      .mockReturnValueOnce(diagnostics_unsubscribe_1)
      .mockReturnValueOnce(diagnostics_unsubscribe_2);
    vi.mocked(port.subscribe_status)
      .mockReturnValueOnce(status_unsubscribe_1)
      .mockReturnValueOnce(status_unsubscribe_2);

    const store = new MarkdownLspStore();
    const diagnostics_store = new DiagnosticsStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const service = new MarkdownLspService(
      port,
      store,
      vault_store,
      diagnostics_store,
    );

    await service.start("marksman");
    await service.start("marksman");

    expect(port.stop).not.toHaveBeenCalled();
    expect(diagnostics_unsubscribe_1).toHaveBeenCalledOnce();
    expect(status_unsubscribe_1).toHaveBeenCalledOnce();
    expect(vi.mocked(port.subscribe_diagnostics)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(port.subscribe_status)).toHaveBeenCalledTimes(2);
  });

  it("ignores status events from a different vault", async () => {
    const harness = create_mock_port();
    const store = new MarkdownLspStore();
    const diagnostics_store = new DiagnosticsStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault({ id: "vault-a" as any }));

    const service = new MarkdownLspService(
      harness.port,
      store,
      vault_store,
      diagnostics_store,
    );

    await service.start("marksman");

    harness.emit_status({
      type: "status_changed",
      vault_id: "vault-b",
      status: { failed: { message: "wrong vault" } },
    });
    expect(store.status).toBe("running");

    harness.emit_status({
      type: "status_changed",
      vault_id: "vault-a",
      status: { failed: { message: "right vault" } },
    });

    expect(store.status).toEqual({ failed: { message: "right vault" } });
  });

  it("passes startup reason and initial IWE provider config to the port", async () => {
    const { port } = create_mock_port();
    const store = new MarkdownLspStore();
    const diagnostics_store = new DiagnosticsStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const service = new MarkdownLspService(
      port,
      store,
      vault_store,
      diagnostics_store,
    );

    await service.start("iwes", undefined, {
      reason: "lazy_open_note",
      initial_iwe_provider_config: iwe_provider_config,
    });

    expect(port.start).toHaveBeenCalledWith(
      vault_store.vault?.id,
      "iwes",
      undefined,
      "lazy_open_note",
      iwe_provider_config,
    );
  });

  it("propagates restarting status with attempt number to the store", async () => {
    const harness = create_mock_port();
    const store = new MarkdownLspStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const service = new MarkdownLspService(harness.port, store, vault_store);

    await service.start("marksman");
    expect(store.status).toBe("running");

    harness.emit_status({
      type: "status_changed",
      vault_id: vault_store.vault!.id,
      status: { restarting: { attempt: 2 } },
    });
    expect(store.status).toEqual({ restarting: { attempt: 2 } });

    harness.emit_status({
      type: "status_changed",
      vault_id: vault_store.vault!.id,
      status: "running",
    });
    expect(store.status).toBe("running");
  });

  it("sets failed status with message on start failure", async () => {
    const harness = create_mock_port();
    vi.mocked(harness.port.start).mockRejectedValue(new Error("spawn failed"));

    const store = new MarkdownLspStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const service = new MarkdownLspService(harness.port, store, vault_store);

    await service.start("marksman");
    expect(store.status).toEqual({ failed: { message: "spawn failed" } });
  });

  it("resets store to stopped on stop", async () => {
    const harness = create_mock_port();
    const store = new MarkdownLspStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const service = new MarkdownLspService(harness.port, store, vault_store);

    await service.start("marksman");
    expect(store.status).toBe("running");

    await service.stop();
    expect(store.status).toBe("stopped");
  });

  describe("did_close", () => {
    it("calls port and clears doc_versions when running", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      await service.did_open("note.md", "hello");
      await service.did_close("note.md");

      expect(port.did_close).toHaveBeenCalledWith(
        vault_store.vault!.id,
        "note.md",
      );
    });

    it("is a no-op when not running", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);

      await service.did_close("note.md");
      expect(port.did_close).not.toHaveBeenCalled();
    });

    it("clears version tracking so re-open starts at version 1", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      await service.did_open("note.md", "v1");
      await service.did_change("note.md", "v2");
      await service.did_close("note.md");
      await service.did_open("note.md", "fresh");

      const open_calls = vi.mocked(port.did_open).mock.calls;
      expect(open_calls).toHaveLength(2);
    });
  });

  describe("provider capabilities", () => {
    it("start sets effective_provider in store", async () => {
      const { port } = create_mock_port();
      vi.mocked(port.start).mockResolvedValue({
        completion_trigger_characters: ["+"],
        effective_provider: "iwes",
        server_capabilities: {
          hover: true,
          completion: true,
          references: true,
          definition: true,
          code_actions: true,
          rename: true,
          formatting: true,
          inlay_hints: true,
          workspace_symbols: true,
          document_symbols: true,
        },
      });
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("iwes");

      expect(store.effective_provider).toBe("iwes");
    });

    it("stop clears effective_provider", async () => {
      const { port } = create_mock_port();
      vi.mocked(port.start).mockResolvedValue({
        completion_trigger_characters: ["+"],
        effective_provider: "iwes",
        server_capabilities: {
          hover: true,
          completion: true,
          references: true,
          definition: true,
          code_actions: true,
          rename: true,
          formatting: true,
          inlay_hints: true,
          workspace_symbols: true,
          document_symbols: true,
        },
      });
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("iwes");
      expect(store.effective_provider).toBe("iwes");

      await service.stop();
      expect(store.effective_provider).toBeNull();
    });

    it("capabilities reflect iwes provider", async () => {
      const { port } = create_mock_port();
      vi.mocked(port.start).mockResolvedValue({
        completion_trigger_characters: ["+"],
        effective_provider: "iwes",
        server_capabilities: {
          hover: true,
          completion: true,
          references: true,
          definition: true,
          code_actions: true,
          rename: true,
          formatting: true,
          inlay_hints: true,
          workspace_symbols: true,
          document_symbols: true,
        },
      });
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("iwes");

      expect(store.capabilities).toEqual({
        hover: true,
        completion: true,
        references: true,
        definition: true,
        code_actions: true,
        rename: true,
        formatting: true,
        inlay_hints: true,
        workspace_symbols: true,
        document_symbols: true,
        transform_actions: true,
      });
    });

    it("capabilities reflect marksman provider", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      expect(store.capabilities).toEqual({
        hover: true,
        completion: true,
        references: true,
        definition: true,
        code_actions: false,
        rename: false,
        formatting: false,
        inlay_hints: false,
        workspace_symbols: false,
        document_symbols: true,
        transform_actions: false,
      });
    });

    it("capabilities are null when no provider set", () => {
      const store = new MarkdownLspStore();
      expect(store.capabilities).toBeNull();
    });

    it("reset clears effective_provider", async () => {
      const store = new MarkdownLspStore();
      store.set_effective_provider("iwes");
      expect(store.effective_provider).toBe("iwes");

      store.reset();
      expect(store.effective_provider).toBeNull();
      expect(store.capabilities).toBeNull();
    });
  });

  it("does not restart after rewriting config when the LSP is idle", async () => {
    const { port } = create_mock_port();
    const store = new MarkdownLspStore();
    const diagnostics_store = new DiagnosticsStore();
    const vault_store = new VaultStore();
    vault_store.set_vault(create_test_vault());

    const service = new MarkdownLspService(
      port,
      store,
      vault_store,
      diagnostics_store,
    );

    await service.rewrite_provider_and_restart(iwe_provider_config);

    expect(port.iwe_config_rewrite_provider).toHaveBeenCalledOnce();
    expect(port.stop).not.toHaveBeenCalled();
    expect(port.start).not.toHaveBeenCalled();
  });

  describe("diagnostics forwarding", () => {
    it("forwards diagnostics to diagnostics store with correct source and positions", async () => {
      const harness = create_mock_port();
      const store = new MarkdownLspStore();
      const diagnostics_store = new DiagnosticsStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({
          id: "vault-a" as any,
          path: "/vaults/test" as any,
        }),
      );

      const service = new MarkdownLspService(
        harness.port,
        store,
        vault_store,
        diagnostics_store,
      );
      await service.start("marksman");

      harness.emit_diagnostics({
        type: "diagnostics_updated",
        vault_id: "vault-a",
        uri: "file:///vaults/test/notes/hello.md",
        diagnostics: [
          {
            line: 0,
            character: 5,
            end_line: 0,
            end_character: 10,
            severity: "warning",
            message: "bad link",
          },
        ],
      });

      diagnostics_store.set_active_file("notes/hello.md");
      const file_diags = diagnostics_store.active_diagnostics;
      expect(file_diags).toHaveLength(1);
      const d = file_diags[0]!;
      expect(d.source).toBe("markdown_lsp");
      expect(d.line).toBe(1);
      expect(d.column).toBe(6);
      expect(d.message).toBe("bad link");
    });

    it("ignores diagnostics from wrong vault", async () => {
      const harness = create_mock_port();
      const store = new MarkdownLspStore();
      const diagnostics_store = new DiagnosticsStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(
        create_test_vault({
          id: "vault-a" as any,
          path: "/vaults/test" as any,
        }),
      );

      const service = new MarkdownLspService(
        harness.port,
        store,
        vault_store,
        diagnostics_store,
      );
      await service.start("marksman");

      harness.emit_diagnostics({
        type: "diagnostics_updated",
        vault_id: "vault-b",
        uri: "file:///vaults/other/notes/hello.md",
        diagnostics: [
          {
            line: 0,
            character: 0,
            end_line: 0,
            end_character: 5,
            severity: "error",
            message: "wrong vault",
          },
        ],
      });

      diagnostics_store.set_active_file("notes/hello.md");
      expect(diagnostics_store.active_diagnostics).toHaveLength(0);
    });
  });

  describe("channel closed handling", () => {
    it("sets failed status when channel closed during running", async () => {
      const harness = create_mock_port();
      vi.mocked(harness.port.hover).mockRejectedValue(
        new Error("channel closed"),
      );
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(harness.port, store, vault_store);
      await service.start("marksman");
      expect(store.status).toBe("running");

      await service.hover("note.md", 0, 0);
      expect(store.status).toEqual({
        failed: { message: "Markdown LSP process crashed — restarting..." },
      });
    });

    it("silently ignores channel closed when already stopped", async () => {
      const harness = create_mock_port();
      vi.mocked(harness.port.hover).mockRejectedValue(
        new Error("channel closed"),
      );
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(harness.port, store, vault_store);
      await service.hover("note.md", 0, 0);
      expect(store.status).toBe("stopped");
      expect(harness.port.hover).not.toHaveBeenCalled();
    });
  });

  describe("query methods guard by status", () => {
    it("hover is no-op when not running", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);

      await service.hover("note.md", 0, 0);
      expect(port.hover).not.toHaveBeenCalled();
    });

    it("code_actions is no-op when not running", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);

      await service.code_actions("note.md", 0, 0, 1, 0);
      expect(port.code_actions).not.toHaveBeenCalled();
    });

    it("completion is no-op when not running", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);

      await service.completion("note.md", 0, 0);
      expect(port.completion).not.toHaveBeenCalled();
    });
  });

  describe("restart behavior", () => {
    it("restart calls stop then start with last provider", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      await service.restart();
      expect(port.stop).toHaveBeenCalled();
      expect(port.start).toHaveBeenCalledTimes(2);
    });

    it("ensure_started is no-op when already running", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      await service.ensure_started("marksman");
      expect(port.start).toHaveBeenCalledTimes(1);
    });
  });

  describe("version tracking lifecycle", () => {
    it("did_change increments version for same file", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      await service.did_open("note.md", "v1");
      await service.did_change("note.md", "v2");
      await service.did_change("note.md", "v3");

      const change_calls = vi.mocked(port.did_change).mock.calls;
      expect(change_calls[0]![2]).toBe(2);
      expect(change_calls[1]![2]).toBe(3);
    });

    it("did_open after close resets version to 1", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      await service.did_open("note.md", "v1");
      await service.did_change("note.md", "v2");
      await service.did_close("note.md");
      await service.did_open("note.md", "fresh");
      await service.did_change("note.md", "change");

      const change_calls = vi.mocked(port.did_change).mock.calls;
      expect(change_calls[0]![2]).toBe(2);
      expect(change_calls[1]![2]).toBe(2);
    });
  });

  describe("stale-result guarding", () => {
    it("discards stale hover results when superseded", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      let resolve_first!: (v: { contents: string | null }) => void;
      let resolve_second!: (v: { contents: string | null }) => void;

      vi.mocked(port.hover)
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve_first = r;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve_second = r;
            }),
        );

      const p1 = service.hover("note.md", 0, 0);
      const p2 = service.hover("note.md", 1, 0);

      resolve_second({ contents: "second" });
      await p2;
      expect(store.last_hover).toEqual({ contents: "second" });

      resolve_first({ contents: "first (stale)" });
      await p1;
      expect(store.last_hover).toEqual({ contents: "second" });
    });

    it("discards stale completion results when superseded", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      let resolve_first!: (
        v: { label: string; detail: null; insert_text: null }[],
      ) => void;
      let resolve_second!: (
        v: { label: string; detail: null; insert_text: null }[],
      ) => void;

      vi.mocked(port.completion)
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve_first = r;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve_second = r;
            }),
        );

      const p1 = service.completion("note.md", 0, 0);
      const p2 = service.completion("note.md", 1, 0);

      resolve_second([{ label: "second", detail: null, insert_text: null }]);
      await p2;
      expect(store.completions).toHaveLength(1);
      expect(store.completions[0]!.label).toBe("second");

      resolve_first([{ label: "stale", detail: null, insert_text: null }]);
      await p1;
      expect(store.completions[0]!.label).toBe("second");
    });

    it("discards stale code_actions results when superseded", async () => {
      const { port } = create_mock_port();
      const store = new MarkdownLspStore();
      const vault_store = new VaultStore();
      vault_store.set_vault(create_test_vault());

      const service = new MarkdownLspService(port, store, vault_store);
      await service.start("marksman");

      let resolve_first!: (
        v: { title: string; kind: null; data: null; raw_json: string }[],
      ) => void;
      let resolve_second!: (
        v: { title: string; kind: null; data: null; raw_json: string }[],
      ) => void;

      vi.mocked(port.code_actions)
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve_first = r;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise((r) => {
              resolve_second = r;
            }),
        );

      const p1 = service.code_actions("note.md", 0, 0, 1, 0);
      const p2 = service.code_actions("note.md", 2, 0, 3, 0);

      resolve_second([
        { title: "second", kind: null, data: null, raw_json: "{}" },
      ]);
      await p2;
      expect(store.code_actions).toHaveLength(1);
      expect(store.code_actions[0]!.title).toBe("second");

      resolve_first([
        { title: "stale", kind: null, data: null, raw_json: "{}" },
      ]);
      await p1;
      expect(store.code_actions[0]!.title).toBe("second");
    });
  });
});
