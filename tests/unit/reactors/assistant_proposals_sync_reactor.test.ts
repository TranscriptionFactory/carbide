// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushSync } from "svelte";
import { AssistantProposalStore } from "$lib/features/assistant";
import type {
  Proposal,
  ProposalPersistenceService,
} from "$lib/features/assistant";
import { VaultStore } from "$lib/features/vault";
import { create_assistant_proposals_sync_reactor } from "$lib/reactors/assistant_proposals_sync.reactor.svelte";
import { create_test_vault } from "../helpers/test_fixtures";
import { make_proposal } from "../helpers/assistant_proposal_fixtures";
import type { VaultId } from "$lib/shared/types/ids";

const DEBOUNCE_MS = 400;

type FakePersistence = ProposalPersistenceService & {
  load_pending: ReturnType<
    typeof vi.fn<(vault_id: string) => Promise<Proposal[]>>
  >;
  save_pending: ReturnType<
    typeof vi.fn<
      (vault_id: string, proposals: readonly Proposal[]) => Promise<void>
    >
  >;
};

function fake_persistence(
  by_vault: Record<string, Proposal[]> = {},
): FakePersistence {
  return {
    load_pending: vi.fn<(vault_id: string) => Promise<Proposal[]>>((vault_id) =>
      Promise.resolve(by_vault[vault_id] ?? []),
    ),
    save_pending: vi.fn<
      (vault_id: string, proposals: readonly Proposal[]) => Promise<void>
    >(() => Promise.resolve()),
  } as unknown as FakePersistence;
}

function vault_store_for(id: string, mode: "vault" | "browse" = "vault") {
  const store = new VaultStore();
  store.set_vault(create_test_vault({ id: id as VaultId, mode }));
  return store;
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  flushSync();
}

describe("assistant_proposals_sync reactor", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates the pending queue when a vault becomes active", async () => {
    const stored = make_proposal({ id: "persisted" });
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence({ v1: [stored] });

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store_for("v1"),
    );
    flushSync();
    await settle();

    expect(proposals.proposals).toEqual([stored]);
    expect(persistence.load_pending).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("never saves before hydration has completed (empty-store clobber guard)", async () => {
    let resolve_load: (proposals: Proposal[]) => void = () => {};
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence();
    persistence.load_pending.mockImplementation(
      () =>
        new Promise<Proposal[]>((resolve) => {
          resolve_load = resolve;
        }),
    );

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store_for("v1"),
    );
    flushSync();

    // a producer races the slow load
    proposals.add(make_proposal({ id: "early" }));
    flushSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    expect(persistence.save_pending).not.toHaveBeenCalled();

    resolve_load([]);
    await settle();
    cleanup();
  });

  it("drops a slow load that resolves after a vault switch (generation guard)", async () => {
    let resolve_v1: (proposals: Proposal[]) => void = () => {};
    const proposals = new AssistantProposalStore();
    const v2_proposal = make_proposal({ id: "v2-proposal" });
    const persistence = fake_persistence();
    persistence.load_pending.mockImplementation((vault_id: string) => {
      if (vault_id === "v1") {
        return new Promise<Proposal[]>((resolve) => {
          resolve_v1 = resolve;
        });
      }
      return Promise.resolve([v2_proposal]);
    });
    const vault_store = vault_store_for("v1");

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store,
    );
    flushSync();

    vault_store.set_vault(create_test_vault({ id: "v2" as VaultId }));
    flushSync();
    await settle();
    expect(proposals.proposals).toEqual([v2_proposal]);

    resolve_v1([make_proposal({ id: "stale-v1" })]);
    await settle();
    expect(proposals.proposals).toEqual([v2_proposal]);
    cleanup();
  });

  it("persists a NEW pending proposal immediately — it is the only copy of the work", async () => {
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence();

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store_for("v1"),
    );
    flushSync();
    await settle();
    persistence.save_pending.mockClear();

    const fresh = make_proposal({ id: "fresh" });
    proposals.add(fresh);
    flushSync();

    expect(persistence.save_pending).toHaveBeenCalledWith("v1", [fresh]);
    cleanup();
  });

  it("debounces review churn (hunk toggles) instead of writing per keystroke", async () => {
    const stored = make_proposal({ id: "persisted" });
    const hunk_id = stored.hunks[0]?.id ?? "";
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence({ v1: [stored] });

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store_for("v1"),
    );
    flushSync();
    await settle();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    persistence.save_pending.mockClear();

    proposals.set_hunk_selected(stored.id, hunk_id, false);
    flushSync();
    expect(persistence.save_pending).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(persistence.save_pending).toHaveBeenCalledTimes(1);
    cleanup();
  });

  it("never writes in Browse mode — the vault rejects .carbide writes", async () => {
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence();

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store_for("v1", "browse"),
    );
    flushSync();
    await settle();

    proposals.add(make_proposal({ id: "fresh" }));
    flushSync();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);

    expect(persistence.save_pending).not.toHaveBeenCalled();
    cleanup();
  });

  it("flushes the outgoing vault's pending write on a switch, then hydrates the next", async () => {
    const stored = make_proposal({ id: "persisted" });
    const hunk_id = stored.hunks[0]?.id ?? "";
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence({ v1: [stored], v2: [] });
    const vault_store = vault_store_for("v1");

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store,
    );
    flushSync();
    await settle();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    persistence.save_pending.mockClear();

    // leave a debounced change in flight, then switch
    proposals.set_hunk_selected(stored.id, hunk_id, false);
    flushSync();
    vault_store.set_vault(create_test_vault({ id: "v2" as VaultId }));
    flushSync();

    expect(persistence.save_pending).toHaveBeenCalledTimes(1);
    const [saved_vault, saved_list] = persistence.save_pending.mock
      .calls[0] as [string, Proposal[]];
    expect(saved_vault).toBe("v1");
    expect(saved_list[0]?.hunks[0]?.selected).toBe(false);

    await settle();
    expect(proposals.proposals).toEqual([]);
    cleanup();
  });

  it("flushes a pending write on teardown", async () => {
    const stored = make_proposal({ id: "persisted" });
    const hunk_id = stored.hunks[0]?.id ?? "";
    const proposals = new AssistantProposalStore();
    const persistence = fake_persistence({ v1: [stored] });

    const cleanup = create_assistant_proposals_sync_reactor(
      proposals,
      persistence,
      vault_store_for("v1"),
    );
    flushSync();
    await settle();
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 2);
    persistence.save_pending.mockClear();

    proposals.set_hunk_selected(stored.id, hunk_id, false);
    flushSync();
    cleanup();

    expect(persistence.save_pending).toHaveBeenCalledTimes(1);
  });
});
