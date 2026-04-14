import type { MarkdownLspPort } from "$lib/features/markdown_lsp/ports";
import type { MarkdownLspStore } from "$lib/features/markdown_lsp/state/markdown_lsp_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  IweConfigStatus,
  LspProviderConfigStatus,
  MarkdownLspCodeAction,
  MarkdownLspDiagnosticsEvent,
  MarkdownLspPrepareRenameResult,
  MarkdownLspStartReason,
  MarkdownLspStartResult,
  MarkdownLspStatusEvent,
  MarkdownLspTextEdit,
  MarkdownLspWorkspaceEditResult,
} from "$lib/features/markdown_lsp/types";
import type {
  DiagnosticsStore,
  Diagnostic,
  DiagnosticSeverity,
} from "$lib/features/diagnostics";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("markdown_lsp_service");

function is_channel_closed_error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes("channel closed");
}

function error_message_from(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function to_diagnostic_severity(s: string): DiagnosticSeverity {
  if (s === "error" || s === "warning" || s === "info" || s === "hint")
    return s;
  return "hint";
}

function uri_to_relative_path(uri: string, vault_path: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURI(uri);
  } catch {
    decoded = uri;
  }
  const prefix = `file://${vault_path}`;
  if (!decoded.startsWith(prefix)) return null;
  let relative = decoded.slice(prefix.length);
  if (relative.startsWith("/")) relative = relative.slice(1);
  return relative;
}

export class MarkdownLspService {
  private lifecycle = Promise.resolve();
  private doc_versions = new Map<string, number>();
  private unsubscribe_diagnostics: (() => void) | null = null;
  private unsubscribe_status: (() => void) | null = null;
  private last_provider: string | undefined = undefined;
  private last_custom_binary_path: string | undefined = undefined;
  private active_vault_id: string | null = null;
  private hover_gen = 0;
  private completion_gen = 0;
  private code_actions_gen = 0;

  constructor(
    private readonly port: MarkdownLspPort,
    private readonly store: MarkdownLspStore,
    private readonly vault_store: VaultStore,
    private readonly diagnostics_store?: DiagnosticsStore,
  ) {}

  async start(
    provider?: string,
    custom_binary_path?: string,
    options?: {
      reason?: MarkdownLspStartReason;
      initial_iwe_provider_config?: AiProviderConfig;
    },
  ): Promise<MarkdownLspStartResult | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;

    this.last_provider = provider;
    this.last_custom_binary_path = custom_binary_path;
    const startup_reason = options?.reason ?? "initial_start";

    return this.run_lifecycle(async () => {
      this.store.set_status("starting");
      try {
        this.unsubscribe_all();
        if (this.active_vault_id && this.active_vault_id !== vault_id) {
          await this.port.stop(this.active_vault_id).catch((error: unknown) => {
            log.from_error(
              `Failed to stop markdown LSP for inactive vault ${this.active_vault_id}`,
              error,
            );
          });
        }
        this.doc_versions.clear();
        this.subscribe_diagnostics();
        this.subscribe_status();
        const result = await this.port.start(
          vault_id,
          provider,
          custom_binary_path || undefined,
          startup_reason,
          options?.initial_iwe_provider_config,
        );
        this.store.set_completion_trigger_characters(
          result.completion_trigger_characters,
        );
        this.store.set_effective_provider(result.effective_provider);
        this.store.set_server_capabilities(result.server_capabilities);
        this.active_vault_id = vault_id;
        this.store.set_status("running");
        log.info("Markdown LSP started", {
          startup_reason,
          requested_provider: provider ?? "iwes",
          effective_provider: result.effective_provider,
        });
        return result;
      } catch (e) {
        this.unsubscribe_all();
        log.from_error("Failed to start markdown LSP", e);
        this.store.set_status({
          failed: { message: error_message_from(e) },
        });
        return null;
      }
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start(this.last_provider, this.last_custom_binary_path, {
      reason: "explicit_restart",
    });
  }

  async stop(): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;
    await this.stop_for_vault(vault_id);
  }

  async stop_for_vault(vault_id: string): Promise<void> {
    await this.run_lifecycle(async () => {
      this.unsubscribe_all();
      try {
        await this.port.stop(vault_id);
      } catch (e) {
        log.from_error("Failed to stop markdown LSP", e);
      }
      if (this.active_vault_id === vault_id) {
        this.active_vault_id = null;
      }
      this.doc_versions.clear();
      this.hover_gen = 0;
      this.completion_gen = 0;
      this.code_actions_gen = 0;
      this.store.reset();
      this.diagnostics_store?.clear_source("markdown_lsp");
    });
  }

  private subscribe_diagnostics(): void {
    if (!this.diagnostics_store) return;
    this.unsubscribe_diagnostics = this.port.subscribe_diagnostics(
      (event: MarkdownLspDiagnosticsEvent) => {
        this.handle_diagnostics(event);
      },
    );
  }

  private subscribe_status(): void {
    this.unsubscribe_status = this.port.subscribe_status(
      (event: MarkdownLspStatusEvent) => {
        this.handle_status_change(event);
      },
    );
  }

  private handle_status_change(event: MarkdownLspStatusEvent): void {
    if (event.vault_id !== this.vault_store.vault?.id) return;
    this.store.set_status(event.status);
  }

  private unsubscribe_all(): void {
    if (this.unsubscribe_diagnostics) {
      this.unsubscribe_diagnostics();
      this.unsubscribe_diagnostics = null;
    }
    if (this.unsubscribe_status) {
      this.unsubscribe_status();
      this.unsubscribe_status = null;
    }
  }

  private handle_diagnostics(event: MarkdownLspDiagnosticsEvent): void {
    if (!this.diagnostics_store) return;
    if (event.vault_id !== this.vault_store.vault?.id) return;
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) return;

    const relative_path = uri_to_relative_path(event.uri, vault_path);
    if (!relative_path) return;

    const diagnostics: Diagnostic[] = event.diagnostics.map((d) => ({
      source: "markdown_lsp" as const,
      line: d.line + 1,
      column: d.character + 1,
      end_line: d.end_line + 1,
      end_column: d.end_character + 1,
      severity: to_diagnostic_severity(d.severity),
      message: d.message,
      rule_id: "markdown_lsp",
      fixable: false,
    }));

    this.diagnostics_store.push("markdown_lsp", relative_path, diagnostics);
  }

  async did_open(file_path: string, content: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    this.doc_versions.set(file_path, 1);
    try {
      await this.port.did_open(vault_id, file_path, content);
    } catch (e) {
      if (!this.handle_channel_closed(e)) log.from_error("did_open failed", e);
    }
  }

  async did_change(file_path: string, content: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    const version = (this.doc_versions.get(file_path) ?? 0) + 1;
    this.doc_versions.set(file_path, version);
    try {
      await this.port.did_change(vault_id, file_path, version, content);
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("did_change failed", e);
    }
  }

  async did_save(file_path: string, content: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    try {
      await this.port.did_save(vault_id, file_path, content);
    } catch (e) {
      if (!this.handle_channel_closed(e)) log.from_error("did_save failed", e);
    }
  }

  async did_close(file_path: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    this.doc_versions.delete(file_path);
    try {
      await this.port.did_close(vault_id, file_path);
    } catch (e) {
      if (!this.handle_channel_closed(e)) log.from_error("did_close failed", e);
    }
  }

  async hover(
    file_path: string,
    line: number,
    character: number,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    const gen = ++this.hover_gen;
    try {
      const result = await this.port.hover(
        vault_id,
        file_path,
        line,
        character,
      );
      if (gen !== this.hover_gen) return;
      this.store.set_hover(result);
    } catch (e) {
      if (gen !== this.hover_gen) return;
      if (!this.handle_channel_closed(e)) log.from_error("hover failed", e);
      this.store.set_hover(null);
    }
  }

  async references(
    file_path: string,
    line: number,
    character: number,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    this.store.set_loading(true);
    try {
      const refs = await this.port.references(
        vault_id,
        file_path,
        line,
        character,
      );
      this.store.set_references(refs);
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("references failed", e);
        log.warn("Operation error", { error: error_message_from(e) });
      }
      this.store.set_references([]);
    } finally {
      this.store.set_loading(false);
    }
  }

  async definition(
    file_path: string,
    line: number,
    character: number,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    try {
      const locs = await this.port.definition(
        vault_id,
        file_path,
        line,
        character,
      );
      this.store.set_references(locs);
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("definition failed", e);
    }
  }

  async code_actions(
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    const gen = ++this.code_actions_gen;
    try {
      const actions = await this.port.code_actions(
        vault_id,
        file_path,
        start_line,
        start_character,
        end_line,
        end_character,
      );
      if (gen !== this.code_actions_gen) return;
      this.store.set_code_actions(actions);
    } catch (e) {
      if (gen !== this.code_actions_gen) return;
      if (!this.handle_channel_closed(e)) {
        log.from_error("code_actions failed", e);
        log.warn("Operation error", { error: error_message_from(e) });
      }
      this.store.set_code_actions([]);
    }
  }

  async fetch_code_actions(
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ): Promise<MarkdownLspCodeAction[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return [];

    try {
      return await this.port.code_actions(
        vault_id,
        file_path,
        start_line,
        start_character,
        end_line,
        end_character,
      );
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("fetch_code_actions failed", e);
      return [];
    }
  }

  async code_action_resolve(
    code_action_json: string,
  ): Promise<MarkdownLspWorkspaceEditResult | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return null;

    this.store.set_loading(true);
    try {
      const result = await this.port.code_action_resolve(
        vault_id,
        code_action_json,
      );
      if (result.errors.length > 0) {
        log.warn("Code action resolve had errors", { errors: result.errors });
      }
      return result;
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("code_action_resolve failed", e);
        log.warn("Operation error", { error: error_message_from(e) });
      }
      return null;
    } finally {
      this.store.set_loading(false);
    }
  }

  async workspace_symbols(query: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    try {
      const symbols = await this.port.workspace_symbols(vault_id, query);
      this.store.set_symbols(symbols);
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("workspace_symbols failed", e);
        log.warn("Operation error", { error: error_message_from(e) });
      }
      this.store.set_symbols([]);
    }
  }

  async prepare_rename(
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarkdownLspPrepareRenameResult | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return null;

    try {
      return await this.port.prepare_rename(
        vault_id,
        file_path,
        line,
        character,
      );
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("prepare_rename failed", e);
      return null;
    }
  }

  async rename(
    file_path: string,
    line: number,
    character: number,
    new_name: string,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    this.store.set_loading(true);
    try {
      const result = await this.port.rename(
        vault_id,
        file_path,
        line,
        character,
        new_name,
      );
      if (result.errors.length > 0) {
        log.warn("Rename had errors", { errors: result.errors });
      }
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("rename failed", e);
        log.warn("Operation error", { error: error_message_from(e) });
      }
    } finally {
      this.store.set_loading(false);
    }
  }

  async completion(
    file_path: string,
    line: number,
    character: number,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    const gen = ++this.completion_gen;
    try {
      const items = await this.port.completion(
        vault_id,
        file_path,
        line,
        character,
      );
      if (gen !== this.completion_gen) return;
      this.store.set_completions(items);
    } catch (e) {
      if (gen !== this.completion_gen) return;
      if (!this.handle_channel_closed(e))
        log.from_error("completion failed", e);
      this.store.set_completions([]);
    }
  }

  async formatting(file_path: string): Promise<MarkdownLspTextEdit[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return [];

    this.store.set_loading(true);
    try {
      return await this.port.formatting(vault_id, file_path);
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("formatting failed", e);
        log.warn("Operation error", { error: error_message_from(e) });
      }
      return [];
    } finally {
      this.store.set_loading(false);
    }
  }

  async inlay_hints(file_path: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    try {
      const hints = await this.port.inlay_hints(vault_id, file_path);
      this.store.set_inlay_hints(hints);
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("inlay_hints failed", e);
      this.store.set_inlay_hints([]);
    }
  }

  async document_symbols(file_path: string): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    try {
      const symbols = await this.port.document_symbols(vault_id, file_path);
      this.store.set_document_symbols(symbols);
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("document_symbols failed", e);
      this.store.set_document_symbols([]);
    }
  }

  private handle_channel_closed(e: unknown): boolean {
    if (!is_channel_closed_error(e)) return false;
    if (this.store.status !== "running") return true;

    log.warn("Markdown LSP process died — backend will handle restart");
    this.store.set_status({
      failed: { message: "Markdown LSP process crashed — restarting..." },
    });

    return true;
  }

  async iwe_config_status(): Promise<IweConfigStatus | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;
    try {
      return await this.port.iwe_config_status(vault_id);
    } catch (e) {
      log.from_error("Failed to get IWE config status", e);
      return null;
    }
  }

  async iwe_config_reset(): Promise<boolean> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return false;
    try {
      await this.port.iwe_config_reset(vault_id);
      return true;
    } catch (e) {
      log.from_error("Failed to reset IWE config", e);
      return false;
    }
  }

  async lsp_config_status(
    provider: string,
  ): Promise<LspProviderConfigStatus | null> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return null;
    try {
      return await this.port.lsp_config_status(vault_id, provider);
    } catch (e) {
      log.from_error("Failed to get LSP config status", e);
      return null;
    }
  }

  async lsp_config_reset(provider: string): Promise<boolean> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return false;
    try {
      await this.port.lsp_config_reset(vault_id, provider);
      return true;
    } catch (e) {
      log.from_error("Failed to reset LSP config", e);
      return false;
    }
  }

  async iwe_config_rewrite_provider(
    provider_config: AiProviderConfig,
  ): Promise<boolean> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return false;
    try {
      await this.port.iwe_config_rewrite_provider(vault_id, provider_config);
      return true;
    } catch (e) {
      log.from_error("Failed to rewrite IWE config for provider", e);
      return false;
    }
  }

  async rewrite_provider_and_restart(
    provider_config: AiProviderConfig,
  ): Promise<void> {
    const ok = await this.iwe_config_rewrite_provider(provider_config);
    if (!ok) return;
    if (this.store.status !== "running") {
      log.info("Rewrote IWE config without restart because LSP is idle", {
        provider: provider_config.name,
      });
      return;
    }
    log.info("Rewrote IWE config, restarting LSP", {
      provider: provider_config.name,
    });
    await this.restart();
  }

  async ensure_started(
    provider?: string,
    custom_binary_path?: string,
    options?: {
      reason?: MarkdownLspStartReason;
      initial_iwe_provider_config?: AiProviderConfig;
    },
  ): Promise<MarkdownLspStartResult | null> {
    if (this.store.status === "running") return null;
    return this.start(provider, custom_binary_path, options);
  }

  private run_lifecycle<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
