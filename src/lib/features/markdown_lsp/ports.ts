import type { AiProviderConfig } from "$lib/shared/types/ai_provider_config";
import type {
  IweConfigStatus,
  LspProviderConfigStatus,
  MarkdownLspCodeAction,
  MarkdownLspCompletionItem,
  MarkdownLspDiagnosticsEvent,
  MarkdownLspDocumentSymbol,
  MarkdownLspHoverResult,
  MarkdownLspInlayHint,
  MarkdownLspLocation,
  MarkdownLspPrepareRenameResult,
  MarkdownLspStartReason,
  MarkdownLspStartResult,
  MarkdownLspStatusEvent,
  MarkdownLspSymbol,
  MarkdownLspTextEdit,
  MarkdownLspWorkspaceEditResult,
} from "$lib/features/markdown_lsp/types";

export interface MarkdownLspPort {
  start(
    vault_id: string,
    provider?: string,
    custom_binary_path?: string,
    startup_reason?: MarkdownLspStartReason,
    initial_iwe_provider_config?: AiProviderConfig,
  ): Promise<MarkdownLspStartResult>;
  stop(vault_id: string): Promise<void>;

  did_open(vault_id: string, file_path: string, content: string): Promise<void>;
  did_change(
    vault_id: string,
    file_path: string,
    version: number,
    content: string,
  ): Promise<void>;
  did_save(vault_id: string, file_path: string, content: string): Promise<void>;
  did_close(vault_id: string, file_path: string): Promise<void>;

  hover(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarkdownLspHoverResult>;
  references(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarkdownLspLocation[]>;
  definition(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarkdownLspLocation[]>;
  code_actions(
    vault_id: string,
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ): Promise<MarkdownLspCodeAction[]>;
  code_action_resolve(
    vault_id: string,
    code_action_json: string,
  ): Promise<MarkdownLspWorkspaceEditResult>;
  workspace_symbols(
    vault_id: string,
    query: string,
  ): Promise<MarkdownLspSymbol[]>;
  rename(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
    new_name: string,
  ): Promise<MarkdownLspWorkspaceEditResult>;
  prepare_rename(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarkdownLspPrepareRenameResult | null>;
  completion(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarkdownLspCompletionItem[]>;
  formatting(
    vault_id: string,
    file_path: string,
  ): Promise<MarkdownLspTextEdit[]>;
  inlay_hints(
    vault_id: string,
    file_path: string,
  ): Promise<MarkdownLspInlayHint[]>;
  document_symbols(
    vault_id: string,
    file_path: string,
  ): Promise<MarkdownLspDocumentSymbol[]>;
  subscribe_diagnostics(
    callback: (event: MarkdownLspDiagnosticsEvent) => void,
  ): () => void;
  subscribe_status(
    callback: (event: MarkdownLspStatusEvent) => void,
  ): () => void;

  iwe_config_status(vault_id: string): Promise<IweConfigStatus>;
  iwe_config_reset(vault_id: string): Promise<void>;
  iwe_config_rewrite_provider(
    vault_id: string,
    provider_config: AiProviderConfig,
  ): Promise<void>;

  lsp_config_status(
    vault_id: string,
    provider: string,
  ): Promise<LspProviderConfigStatus>;
  lsp_config_reset(vault_id: string, provider: string): Promise<void>;
}
