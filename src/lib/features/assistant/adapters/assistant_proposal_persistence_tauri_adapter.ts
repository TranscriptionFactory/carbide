import { invoke } from "@tauri-apps/api/core";
import { APP_DIR } from "$lib/shared/constants/special_folders";
import type { ProposalPersistencePort } from "$lib/features/assistant/ports";

// One file per vault — proposal ids contain `:`/`/`/`#`, so the session
// adapter's SAFE_ID per-file scheme cannot hold them. No legacy path: this
// file has no predecessor.
const PROPOSALS_PATH = `${APP_DIR}/assistant/proposals.json`;

export function create_assistant_proposal_persistence_tauri_adapter(): ProposalPersistencePort {
  return {
    async load_proposals(vault_id: string): Promise<unknown> {
      try {
        const content = await invoke<string>("read_vault_file", {
          vaultId: vault_id,
          relativePath: PROPOSALS_PATH,
        });
        return JSON.parse(content) as unknown;
      } catch {
        return null;
      }
    },

    async save_proposals(vault_id: string, stored: unknown): Promise<void> {
      await invoke("write_vault_file", {
        vaultId: vault_id,
        relativePath: PROPOSALS_PATH,
        content: JSON.stringify(stored, null, 2),
      });
    },
  };
}
