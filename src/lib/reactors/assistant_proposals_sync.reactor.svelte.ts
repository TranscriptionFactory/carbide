import type { VaultStore } from "$lib/features/vault";
import type {
  AssistantProposalStore,
  Proposal,
  ProposalPersistenceService,
} from "$lib/features/assistant";
import { load_assistant_proposals } from "$lib/features/assistant";
import { create_persisted_snapshot_controller } from "$lib/reactors/persisted_snapshot";

const PROPOSALS_PERSIST_DELAY_MS = 400;

type ProposalsSnapshot = {
  vault_id: string;
  pending: Proposal[];
};

// ONE reactor owns both load and save: the save effect is gated on
// hydrated_vault_id, and two separate reactors could not order that guard —
// a save racing an unfinished load would clobber the file with an empty
// store.
//
// Two save tiers: a NEW pending id persists immediately (agent-turn rollback
// makes the proposal the only copy of the turn's work, so a crash inside a
// debounce window would lose it); status flips and hunk toggles are review
// churn and debounce.
export function create_assistant_proposals_sync_reactor(
  proposals: AssistantProposalStore,
  persistence: ProposalPersistenceService,
  vault_store: VaultStore,
): () => void {
  let loading_vault_id: string | null = null;
  let hydrated_vault_id: string | null = null;
  let known_pending_ids = new Set<string>();

  const persist = create_persisted_snapshot_controller<ProposalsSnapshot>({
    delay_ms: PROPOSALS_PERSIST_DELAY_MS,
    // Dedup key, not the payload: everything on a proposal except status and
    // hunk selection is immutable per id (the store only ever flips those),
    // so ids + selection bits identify the persisted content without
    // serializing every diff line on each store change.
    serialize: ({ pending }) =>
      JSON.stringify(
        pending.map((p) => [p.id, p.hunks.map((h) => h.selected)]),
      ),
    save: ({ vault_id, pending }) =>
      persistence.save_pending(vault_id, pending),
  });

  return $effect.root(() => {
    $effect(() => {
      const vault_id = vault_store.active_vault_id;
      if (vault_id === loading_vault_id) return;
      // Vault switch: flush the outgoing vault's pending write while the
      // store still holds its proposals, then clear before the new load.
      persist.flush_pending();
      persist.reset_saved();
      loading_vault_id = vault_id;
      hydrated_vault_id = null;
      known_pending_ids = new Set();
      proposals.hydrate([]);
      if (!vault_id) return;
      void load_assistant_proposals(
        proposals,
        persistence,
        vault_id,
        () => vault_store.active_vault_id === vault_id,
      ).then(() => {
        if (vault_store.active_vault_id !== vault_id) return;
        hydrated_vault_id = vault_id;
        known_pending_ids = new Set(proposals.pending.map((p) => p.id));
      });
    });

    $effect(() => {
      const list = proposals.proposals;
      const vault_id = vault_store.active_vault_id;
      const is_vault_mode = vault_store.is_vault_mode;
      // hydrated gate = the empty-store-clobber guard: before the load
      // resolves, the store is empty and a save would erase the file.
      if (!vault_id || vault_id !== hydrated_vault_id) return;
      // Browse mode rejects `.carbide/` writes; don't queue what cannot land.
      if (!is_vault_mode) return;

      const pending = list.filter((p) => p.status === "pending");
      const has_new_pending = pending.some((p) => !known_pending_ids.has(p.id));
      known_pending_ids = new Set(pending.map((p) => p.id));

      const snapshot: ProposalsSnapshot = { vault_id, pending };
      if (has_new_pending) {
        persist.persist_now(snapshot);
      } else {
        persist.schedule(snapshot);
      }
    });

    return () => {
      persist.flush_pending();
    };
  });
}
