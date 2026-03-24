import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type {
  CodeLspEvent,
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
  stop_vault(vault_id: VaultId): Promise<void>;
  available_languages(vault_id: VaultId): Promise<string[]>;
  get_status(vault_id: VaultId, language: string): Promise<CodeLspStatus>;
  subscribe_events(callback: (event: CodeLspEvent) => void): () => void;
}
