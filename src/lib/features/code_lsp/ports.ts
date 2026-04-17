import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type {
  CodeLspCodeAction,
  CodeLspCompletionItem,
  CodeLspEvent,
  CodeLspHoverResult,
  CodeLspLocation,
  CodeLspStatus,
} from "$lib/features/code_lsp/types/code_lsp";

export interface CodeLspPort {
  open_file(
    vault_id: VaultId,
    vault_path: VaultPath,
    path: string,
    content: string,
  ): Promise<void>;
  close_file(vault_id: VaultId, path: string): Promise<void>;
  did_change(
    vault_id: VaultId,
    file_path: string,
    content: string,
  ): Promise<void>;
  stop_vault(vault_id: VaultId): Promise<void>;
  available_languages(vault_id: VaultId): Promise<string[]>;
  get_status(vault_id: VaultId, language: string): Promise<CodeLspStatus>;
  hover(
    vault_id: VaultId,
    file_path: string,
    line: number,
    character: number,
  ): Promise<CodeLspHoverResult>;
  definition(
    vault_id: VaultId,
    file_path: string,
    line: number,
    character: number,
  ): Promise<CodeLspLocation[]>;
  completion(
    vault_id: VaultId,
    file_path: string,
    line: number,
    character: number,
  ): Promise<CodeLspCompletionItem[]>;
  code_actions(
    vault_id: VaultId,
    file_path: string,
    start_line: number,
    start_character: number,
    end_line: number,
    end_character: number,
    diagnostics: unknown[],
  ): Promise<CodeLspCodeAction[]>;
  subscribe_events(callback: (event: CodeLspEvent) => void): () => void;
}
