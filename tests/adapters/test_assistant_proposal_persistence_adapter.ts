import type { ProposalPersistencePort } from "$lib/features/assistant";

// In-memory mirror of the tauri adapter: raw JSON values keyed by vault,
// round-tripped through JSON so non-serializable state cannot leak through
// tests that a real file write would reject.
export function create_test_assistant_proposal_persistence_adapter(): ProposalPersistencePort & {
  stored: Map<string, unknown>;
} {
  const stored = new Map<string, unknown>();

  return {
    stored,

    load_proposals(vault_id: string) {
      return Promise.resolve(stored.get(vault_id) ?? null);
    },

    save_proposals(vault_id: string, value: unknown) {
      stored.set(vault_id, JSON.parse(JSON.stringify(value)));
      return Promise.resolve();
    },
  };
}
