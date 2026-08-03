import { APP_DIR } from "$lib/shared/constants/special_folders";
import {
  read_json,
  write_json,
} from "$lib/features/assistant/adapters/vault_json";
import type { ProposalPersistencePort } from "$lib/features/assistant/ports";

// One file per vault — proposal ids contain `:`/`/`/`#`, so the session
// adapter's SAFE_ID per-file scheme cannot hold them. No legacy path: this
// file has no predecessor.
const PROPOSALS_PATH = `${APP_DIR}/assistant/proposals.json`;

export function create_assistant_proposal_persistence_tauri_adapter(): ProposalPersistencePort {
  return {
    load_proposals(vault_id: string): Promise<unknown> {
      return read_json(vault_id, PROPOSALS_PATH);
    },

    save_proposals(vault_id: string, stored: unknown): Promise<void> {
      return write_json(vault_id, PROPOSALS_PATH, stored);
    },
  };
}
