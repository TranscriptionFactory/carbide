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
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    did_open: vi.fn().mockResolvedValue(undefined),
    did_change: vi.fn().mockResolvedValue(undefined),
    did_save: vi.fn().mockResolvedValue(undefined),
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
      status: "failed: wrong vault",
    });
    expect(store.status).toBe("running");
    expect(store.error).toBeNull();

    harness.emit_status({
      type: "status_changed",
      vault_id: "vault-a",
      status: "failed: right vault",
    });

    expect(store.status).toBe("error");
    expect(store.error).toBe("failed: right vault");
  });
});
