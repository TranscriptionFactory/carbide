import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  AssistantProposalStore,
  AssistantSessionStore,
  register_assistant_actions,
} from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import {
  make_proposal,
  make_proposal_hunk,
} from "../helpers/assistant_proposal_fixtures";

function create_harness() {
  const registry = new ActionRegistry();
  const sessions = new AssistantSessionStore();
  const proposals = new AssistantProposalStore();
  const tab = new TabStore();
  const proposal_apply = {
    apply_batch: vi.fn().mockResolvedValue(undefined),
    reject_batch: vi.fn().mockResolvedValue(undefined),
  };

  register_assistant_actions({
    registry,
    stores: { tab } as never,
    services: {} as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    assistant_kernel: { stop: vi.fn(), stop_all: vi.fn() } as never,
    assistant_sessions: sessions,
    assistant_proposals: proposals,
    proposal_apply: proposal_apply as never,
  });

  return { registry, proposals, proposal_apply };
}

describe("register_assistant_actions — proposal actions", () => {
  describe("assistant_accept_proposal", () => {
    it("applies the single proposal id", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

      expect(proposal_apply.apply_batch).toHaveBeenCalledExactlyOnceWith([
        "p1",
      ]);
    });

    it("is a no-op when the arg is missing", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_accept_proposal);

      expect(proposal_apply.apply_batch).not.toHaveBeenCalled();
    });
  });

  describe("assistant_accept_proposals", () => {
    it("applies the batch of ids", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_accept_proposals, [
        "p1",
        "p2",
      ]);

      expect(proposal_apply.apply_batch).toHaveBeenCalledExactlyOnceWith([
        "p1",
        "p2",
      ]);
    });

    it("filters out non-string entries before dispatching", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_accept_proposals, [
        "p1",
        42,
        null,
      ]);

      expect(proposal_apply.apply_batch).toHaveBeenCalledExactlyOnceWith([
        "p1",
      ]);
    });

    it("is a no-op for an empty or non-array arg", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_accept_proposals, []);
      await registry.execute(ACTION_IDS.assistant_accept_proposals, "p1");

      expect(proposal_apply.apply_batch).not.toHaveBeenCalled();
    });
  });

  describe("assistant_reject_proposal", () => {
    it("rejects the single proposal id", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_reject_proposal, "p1");

      expect(proposal_apply.reject_batch).toHaveBeenCalledExactlyOnceWith([
        "p1",
      ]);
    });

    it("is a no-op when the arg is missing", async () => {
      const { registry, proposal_apply } = create_harness();

      await registry.execute(ACTION_IDS.assistant_reject_proposal);

      expect(proposal_apply.reject_batch).not.toHaveBeenCalled();
    });
  });

  describe("assistant_set_proposal_hunk_selected", () => {
    it("toggles the target hunk's selection on the store", async () => {
      const { registry, proposals } = create_harness();
      const hunk = make_proposal_hunk({ id: "h1", selected: true });
      const proposal = make_proposal({ hunks: [hunk] });
      proposals.add(proposal);

      await registry.execute(
        ACTION_IDS.assistant_set_proposal_hunk_selected,
        proposal.id,
        "h1",
        false,
      );

      expect(proposals.get(proposal.id)?.hunks[0]?.selected).toBe(false);
    });

    it("is a no-op when any arg is missing or the wrong type", async () => {
      const { registry, proposals } = create_harness();
      const hunk = make_proposal_hunk({ id: "h1", selected: true });
      const proposal = make_proposal({ hunks: [hunk] });
      proposals.add(proposal);

      await registry.execute(ACTION_IDS.assistant_set_proposal_hunk_selected);
      await registry.execute(
        ACTION_IDS.assistant_set_proposal_hunk_selected,
        proposal.id,
      );
      await registry.execute(
        ACTION_IDS.assistant_set_proposal_hunk_selected,
        proposal.id,
        "h1",
        "not-a-boolean",
      );

      expect(proposals.get(proposal.id)?.hunks[0]?.selected).toBe(true);
    });
  });
});
