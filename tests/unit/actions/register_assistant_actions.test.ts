import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  AssistantSessionStore,
  register_assistant_actions,
} from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";

function create_harness(with_proposal_apply: boolean) {
  const registry = new ActionRegistry();
  const sessions = new AssistantSessionStore();
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
    ...(with_proposal_apply ? { proposal_apply: proposal_apply as never } : {}),
  });

  return { registry, proposal_apply };
}

describe("register_assistant_actions — proposal actions", () => {
  it("does not register the three proposal actions when proposal_apply is not supplied", async () => {
    const { registry } = create_harness(false);

    await expect(
      registry.execute(ACTION_IDS.assistant_accept_proposal, "p1"),
    ).rejects.toThrow();
    await expect(
      registry.execute(ACTION_IDS.assistant_accept_proposals, ["p1"]),
    ).rejects.toThrow();
    await expect(
      registry.execute(ACTION_IDS.assistant_reject_proposal, "p1"),
    ).rejects.toThrow();
  });

  describe("assistant_accept_proposal", () => {
    it("applies the single proposal id", async () => {
      const { registry, proposal_apply } = create_harness(true);

      await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

      expect(proposal_apply.apply_batch).toHaveBeenCalledExactlyOnceWith([
        "p1",
      ]);
    });

    it("is a no-op when the arg is missing", async () => {
      const { registry, proposal_apply } = create_harness(true);

      await registry.execute(ACTION_IDS.assistant_accept_proposal);

      expect(proposal_apply.apply_batch).not.toHaveBeenCalled();
    });
  });

  describe("assistant_accept_proposals", () => {
    it("applies the batch of ids", async () => {
      const { registry, proposal_apply } = create_harness(true);

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
      const { registry, proposal_apply } = create_harness(true);

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
      const { registry, proposal_apply } = create_harness(true);

      await registry.execute(ACTION_IDS.assistant_accept_proposals, []);
      await registry.execute(ACTION_IDS.assistant_accept_proposals, "p1");

      expect(proposal_apply.apply_batch).not.toHaveBeenCalled();
    });
  });

  describe("assistant_reject_proposal", () => {
    it("rejects the single proposal id", async () => {
      const { registry, proposal_apply } = create_harness(true);

      await registry.execute(ACTION_IDS.assistant_reject_proposal, "p1");

      expect(proposal_apply.reject_batch).toHaveBeenCalledExactlyOnceWith([
        "p1",
      ]);
    });

    it("is a no-op when the arg is missing", async () => {
      const { registry, proposal_apply } = create_harness(true);

      await registry.execute(ACTION_IDS.assistant_reject_proposal);

      expect(proposal_apply.reject_batch).not.toHaveBeenCalled();
    });
  });
});
