import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type { CodeLspPort } from "$lib/features/code_lsp/ports";
import type { CodeLspStore } from "$lib/features/code_lsp/state/code_lsp_store.svelte";
import type { DiagnosticsStore, Diagnostic } from "$lib/features/diagnostics";
import type {
  CodeDiagnostic,
  CodeLspEvent,
} from "$lib/features/code_lsp/types/code_lsp";

export class CodeLspService {
  private port: CodeLspPort;
  private store: CodeLspStore;
  private diagnostics_store: DiagnosticsStore;
  private unsubscribe: (() => void) | null = null;

  constructor(
    port: CodeLspPort,
    store: CodeLspStore,
    diagnostics_store: DiagnosticsStore,
  ) {
    this.port = port;
    this.store = store;
    this.diagnostics_store = diagnostics_store;
  }

  start() {
    this.unsubscribe = this.port.subscribe_events((event) =>
      this.handle_event(event),
    );
  }

  stop() {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.store.clear();
    this.diagnostics_store.clear_source("code_lsp");
  }

  async open_file(
    vault_id: VaultId,
    vault_path: VaultPath,
    path: string,
    content: string,
  ): Promise<void> {
    await this.port.open_file(vault_id, vault_path, path, content);
  }

  async close_file(vault_id: VaultId, path: string): Promise<void> {
    this.diagnostics_store.clear_file("code_lsp", path);
    await this.port.close_file(vault_id, path);
  }

  async stop_vault(vault_id: VaultId): Promise<void> {
    this.diagnostics_store.clear_source("code_lsp");
    this.store.clear();
    await this.port.stop_vault(vault_id);
  }

  private handle_event(event: CodeLspEvent) {
    switch (event.type) {
      case "diagnostics_updated":
        this.handle_diagnostics(event.path, event.diagnostics);
        break;
      case "server_status_changed":
        this.handle_status(event.language, event.status);
        break;
    }
  }

  private handle_diagnostics(path: string, raw_diagnostics: CodeDiagnostic[]) {
    const diagnostics: Diagnostic[] = raw_diagnostics.map((d) => ({
      source: "code_lsp" as const,
      line: d.line,
      column: d.column,
      end_line: d.end_line,
      end_column: d.end_column,
      severity: d.severity as Diagnostic["severity"],
      message: d.message,
      rule_id: d.code,
      fixable: false,
    }));
    this.diagnostics_store.push("code_lsp", path, diagnostics);
  }

  private handle_status(language: string, status: unknown) {
    if (typeof status === "string") {
      this.store.set_status(language, status);
    } else if (status && typeof status === "object") {
      if ("error" in status) {
        this.store.set_status(language, "error");
      } else if ("unavailable" in status) {
        this.store.set_status(language, "unavailable");
      }
    }
  }
}
