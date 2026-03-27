import type {
  IweConfigStatus,
  MarksmanCodeAction,
  MarksmanCompletionItem,
  MarksmanDiagnosticsEvent,
  MarksmanDocumentSymbol,
  MarksmanHoverResult,
  MarksmanInlayHint,
  MarksmanLocation,
  MarksmanPrepareRenameResult,
  MarksmanStartResult,
  MarksmanStatusEvent,
  MarksmanSymbol,
  MarksmanTextEdit,
  MarksmanWorkspaceEditResult,
} from "$lib/features/marksman/types";

export interface MarksmanPort {
  start(
    vault_id: string,
    provider?: string,
    custom_binary_path?: string,
  ): Promise<MarksmanStartResult>;
  stop(vault_id: string): Promise<void>;

  did_open(vault_id: string, file_path: string, content: string): Promise<void>;
  did_change(
    vault_id: string,
    file_path: string,
    version: number,
    content: string,
  ): Promise<void>;
  did_save(vault_id: string, file_path: string, content: string): Promise<void>;

  hover(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarksmanHoverResult>;
  references(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarksmanLocation[]>;
  definition(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarksmanLocation[]>;
  code_actions(
    vault_id: string,
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
  ): Promise<MarksmanCodeAction[]>;
  code_action_resolve(
    vault_id: string,
    code_action_json: string,
  ): Promise<MarksmanWorkspaceEditResult>;
  workspace_symbols(vault_id: string, query: string): Promise<MarksmanSymbol[]>;
  rename(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
    new_name: string,
  ): Promise<MarksmanWorkspaceEditResult>;
  prepare_rename(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarksmanPrepareRenameResult | null>;
  completion(
    vault_id: string,
    file_path: string,
    line: number,
    character: number,
  ): Promise<MarksmanCompletionItem[]>;
  formatting(vault_id: string, file_path: string): Promise<MarksmanTextEdit[]>;
  inlay_hints(
    vault_id: string,
    file_path: string,
  ): Promise<MarksmanInlayHint[]>;
  document_symbols(
    vault_id: string,
    file_path: string,
  ): Promise<MarksmanDocumentSymbol[]>;
  subscribe_diagnostics(
    callback: (event: MarksmanDiagnosticsEvent) => void,
  ): () => void;
  subscribe_status(callback: (event: MarksmanStatusEvent) => void): () => void;

  iwe_config_status(vault_id: string): Promise<IweConfigStatus>;
  iwe_config_reset(vault_id: string): Promise<void>;
}
