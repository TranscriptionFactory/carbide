import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type { ProposalPersistenceService } from "$lib/features/assistant/application/proposal_persistence_service";

// One hydration per vault switch, mirroring assistant_sessions_load. The
// is_current guard runs AFTER the await: a slow read for the outgoing vault
// must never land in the incoming vault's store.
export async function load_assistant_proposals(
  proposals: AssistantProposalStore,
  persistence: ProposalPersistenceService,
  vault_id: string,
  is_current: () => boolean = () => true,
): Promise<void> {
  const loaded = await persistence.load_pending(vault_id);
  if (!is_current()) return;
  proposals.hydrate(loaded);
}
