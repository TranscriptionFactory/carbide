import { create_logger } from "$lib/shared/utils/logger";
import { error_message } from "$lib/shared/utils/error_message";
import {
  parse_stored,
  to_stored,
} from "$lib/features/assistant/domain/proposal_storage";
import type { ProposalPersistencePort } from "$lib/features/assistant/ports";
import type { Proposal } from "$lib/features/assistant/types/proposal";

const log = create_logger("proposal_persistence_service");

// Swallows and logs in both directions: Browse mode rejects `.carbide/`
// writes (src-tauri notes/service.rs), and a read failure must degrade to an
// empty queue rather than blocking the vault open.
export class ProposalPersistenceService {
  constructor(
    private readonly port: ProposalPersistencePort,
    private readonly now_ms: () => number = () => Date.now(),
  ) {}

  async load_pending(vault_id: string): Promise<Proposal[]> {
    try {
      return parse_stored(await this.port.load_proposals(vault_id));
    } catch (err) {
      log.warn("Could not load pending proposals", {
        vault_id,
        error: error_message(err),
      });
      return [];
    }
  }

  async save_pending(
    vault_id: string,
    proposals: readonly Proposal[],
  ): Promise<void> {
    try {
      await this.port.save_proposals(
        vault_id,
        to_stored(proposals, this.now_ms()),
      );
    } catch (err) {
      log.warn("Could not save pending proposals", {
        vault_id,
        error: error_message(err),
      });
    }
  }
}
