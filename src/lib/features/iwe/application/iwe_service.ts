import type { IwePort } from "$lib/features/iwe/ports";
import type { IweStore } from "$lib/features/iwe/state/iwe_store.svelte";
import type { VaultStore } from "$lib/features/vault";
import type { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type {
  IweDiagnosticsEvent,
  IwePrepareRenameResult,
  IweTextEdit,
  IweTreeNode,
  IweWorkspaceEditResult,
} from "$lib/features/iwe/types";
import type {
  DiagnosticsStore,
  Diagnostic,
  DiagnosticSeverity,
} from "$lib/features/diagnostics";
import { create_logger } from "$lib/shared/utils/logger";

const log = create_logger("iwe_service");
const CHANNEL_CLOSED_PATTERN = "channel closed";
const AUTO_RESTART_DELAY_MS = 1000;

function is_channel_closed_error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.toLowerCase().includes(CHANNEL_CLOSED_PATTERN);
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

export class IweService {
  private lifecycle = Promise.resolve();
  private doc_versions = new Map<string, number>();
  private unsubscribe_diagnostics: (() => void) | null = null;

  constructor(
    private readonly port: IwePort,
    private readonly store: IweStore,
    private readonly vault_store: VaultStore,
    private readonly ui_store: UIStore,
    private readonly diagnostics_store?: DiagnosticsStore,
  ) {}

  async start(): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    await this.run_lifecycle(async () => {
      this.store.set_status("starting");
      try {
        this.subscribe_diagnostics();
        const result = await this.port.start(vault_id);
        this.store.set_completion_trigger_characters(
          result.completion_trigger_characters,
        );
        this.store.set_status("running");
      } catch (e) {
        this.unsubscribe_all();
        log.from_error("Failed to start IWE", e);
        this.store.set_error(e instanceof Error ? e.message : String(e));
      }
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async stop(): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id) return;

    await this.run_lifecycle(async () => {
      this.unsubscribe_all();
      try {
        await this.port.stop(vault_id);
      } catch (e) {
        log.from_error("Failed to stop IWE", e);
      }
      this.doc_versions.clear();
      this.store.reset();
      this.diagnostics_store?.clear_source("iwe");
    });
  }

  private subscribe_diagnostics(): void {
    if (!this.diagnostics_store) return;
    this.unsubscribe_diagnostics = this.port.subscribe_diagnostics(
      (event: IweDiagnosticsEvent) => this.handle_diagnostics(event),
    );
  }

  private unsubscribe_all(): void {
    if (this.unsubscribe_diagnostics) {
      this.unsubscribe_diagnostics();
      this.unsubscribe_diagnostics = null;
    }
  }

  private handle_diagnostics(event: IweDiagnosticsEvent): void {
    if (!this.diagnostics_store) return;
    const vault_path = this.vault_store.vault?.path;
    if (!vault_path) return;

    const relative_path = uri_to_relative_path(event.uri, vault_path);
    if (!relative_path) return;

    const diagnostics: Diagnostic[] = event.diagnostics.map((d) => ({
      source: "iwe" as const,
      line: d.line + 1,
      column: d.character + 1,
      end_line: d.end_line + 1,
      end_column: d.end_character + 1,
      severity: to_diagnostic_severity(d.severity),
      message: d.message,
      rule_id: "iwe",
      fixable: false,
    }));

    this.diagnostics_store.push("iwe", relative_path, diagnostics);
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

  async hover(
    file_path: string,
    line: number,
    character: number,
  ): Promise<void> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return;

    try {
      const result = await this.port.hover(
        vault_id,
        file_path,
        line,
        character,
      );
      this.store.set_hover(result);
    } catch (e) {
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
        this.store.set_error(e instanceof Error ? e.message : String(e));
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

    try {
      const actions = await this.port.code_actions(
        vault_id,
        file_path,
        start_line,
        start_character,
        end_line,
        end_character,
      );
      this.store.set_code_actions(actions);
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("code_actions failed", e);
        this.store.set_error(e instanceof Error ? e.message : String(e));
      }
      this.store.set_code_actions([]);
    }
  }

  async code_action_resolve(
    code_action_json: string,
  ): Promise<IweWorkspaceEditResult | null> {
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
        this.store.set_error(e instanceof Error ? e.message : String(e));
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
        this.store.set_error(e instanceof Error ? e.message : String(e));
      }
      this.store.set_symbols([]);
    }
  }

  async prepare_rename(
    file_path: string,
    line: number,
    character: number,
  ): Promise<IwePrepareRenameResult | null> {
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
        this.store.set_error(e instanceof Error ? e.message : String(e));
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

    try {
      const items = await this.port.completion(
        vault_id,
        file_path,
        line,
        character,
      );
      this.store.set_completions(items);
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("completion failed", e);
      this.store.set_completions([]);
    }
  }

  async formatting(file_path: string): Promise<IweTextEdit[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return [];

    this.store.set_loading(true);
    try {
      return await this.port.formatting(vault_id, file_path);
    } catch (e) {
      if (!this.handle_channel_closed(e)) {
        log.from_error("formatting failed", e);
        this.store.set_error(e instanceof Error ? e.message : String(e));
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

  async hierarchy_tree(
    root_key: string | null = null,
    depth: number | null = null,
  ): Promise<IweTreeNode[]> {
    const vault_id = this.vault_store.vault?.id;
    if (!vault_id || this.store.status !== "running") return [];

    try {
      return await this.port.hierarchy_tree(vault_id, root_key, depth);
    } catch (e) {
      if (!this.handle_channel_closed(e))
        log.from_error("hierarchy_tree failed", e);
      return [];
    }
  }

  private restart_scheduled = false;

  private handle_channel_closed(e: unknown): boolean {
    if (!is_channel_closed_error(e)) return false;
    if (this.store.status !== "running") return true;

    log.warn("IWE LSP process died, scheduling restart");
    this.store.set_error("IWE process crashed — restarting...");

    if (!this.restart_scheduled) {
      this.restart_scheduled = true;
      setTimeout(() => {
        this.restart_scheduled = false;
        void this.restart();
      }, AUTO_RESTART_DELAY_MS);
    }
    return true;
  }

  private run_lifecycle(operation: () => Promise<void>): Promise<void> {
    const next = this.lifecycle.then(operation, operation);
    this.lifecycle = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
