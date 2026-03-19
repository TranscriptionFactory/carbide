import type { VaultId, VaultPath } from "$lib/shared/types/ids";
import type {
  LintTextEdit,
  FileDiagnostics,
  LintStatus,
  LintEvent,
} from "$lib/features/lint/types/lint";

export interface LintPort {
  start(
    vault_id: VaultId,
    vault_path: VaultPath,
    user_overrides: string,
  ): Promise<void>;
  stop(vault_id: VaultId): Promise<void>;
  open_file(
    vault_id: VaultId,
    path: string,
    content: string,
    version: number,
  ): Promise<void>;
  update_file(
    vault_id: VaultId,
    path: string,
    content: string,
    version: number,
  ): Promise<void>;
  close_file(vault_id: VaultId, path: string): Promise<void>;
  format_file(
    vault_id: VaultId,
    path: string,
    content: string,
  ): Promise<LintTextEdit[]>;
  fix_all(vault_id: VaultId, path: string): Promise<string | null>;
  check_vault(vault_path: VaultPath): Promise<FileDiagnostics[]>;
  format_vault(vault_path: VaultPath): Promise<string[]>;
  get_status(vault_id: VaultId): Promise<LintStatus>;
  subscribe_events(callback: (event: LintEvent) => void): () => void;
}
