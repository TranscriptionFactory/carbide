import { describe, expect, it, vi } from "vitest";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  AssistantChatStore,
  AssistantProposalStore,
  AssistantSessionStore,
  register_assistant_actions,
} from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
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
    chat_store: new AssistantChatStore(sessions),
    active_document_path: () => null,
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

describe("assistant.open_panel (pin 5)", () => {
  function create_panel_harness(options?: {
    open_note_path?: string | null;
    active_document?: string | null;
    provider_id?: string;
  }) {
    const registry = new ActionRegistry();
    const sessions = new AssistantSessionStore();
    const chat_store = new AssistantChatStore(sessions);
    if (options?.provider_id) chat_store.provider_id = options.provider_id;
    const ui = new UIStore();
    ui.editor_settings.ai_default_provider_id = "ollama";
    const open_note_path = options?.open_note_path ?? null;
    const stores = {
      tab: new TabStore(),
      ui,
      editor: {
        open_note: open_note_path
          ? { meta: { path: open_note_path, title: "note", name: "note" } }
          : null,
      },
    };
    const resolve_provider = vi.fn(() =>
      Promise.resolve({ id: "ollama" } as never),
    );
    const attach = vi.fn();
    registry.register({
      id: ACTION_IDS.assistant_attach_document,
      label: "Attach",
      execute: attach,
    });

    register_assistant_actions({
      registry,
      stores: stores as never,
      services: {} as never,
      default_mount_config: {
        reset_app_state: true,
        bootstrap_default_vault_path: null,
      },
      assistant_kernel: {
        stop: vi.fn(),
        stop_all: vi.fn(),
        resolve_provider,
      } as never,
      assistant_sessions: sessions,
      assistant_proposals: new AssistantProposalStore(),
      proposal_apply: {
        apply_batch: vi.fn(),
        reject_batch: vi.fn(),
      } as never,
      chat_store,
      active_document_path: () => options?.active_document ?? null,
    });

    return { registry, chat_store, stores, resolve_provider, attach };
  }

  it("opens the bottom panel on the assistant tab and resolves a provider", async () => {
    const h = create_panel_harness();

    await h.registry.execute(ACTION_IDS.assistant_open_panel);

    expect(h.stores.ui.bottom_panel_tab).toBe("assistant");
    expect(h.stores.ui.bottom_panel_open).toBe(true);
    expect(h.resolve_provider).toHaveBeenCalled();
    expect(h.chat_store.provider_id).toBe("ollama");
  });

  it("seeds an untouched conversation with the open note's scope", async () => {
    const h = create_panel_harness({ open_note_path: "notes/plan.md" });

    await h.registry.execute(ACTION_IDS.assistant_open_panel);

    expect(h.chat_store.scope.notes).toEqual(["notes/plan.md"]);
  });

  it("attaches the active editable document instead of scoping", async () => {
    const h = create_panel_harness({
      active_document: "artifacts/report.html",
      open_note_path: "notes/plan.md",
    });

    await h.registry.execute(ACTION_IDS.assistant_open_panel);

    expect(h.attach).toHaveBeenCalledWith("artifacts/report.html");
    expect(h.chat_store.scope.notes).toBeUndefined();
  });

  it("never re-scopes a conversation in progress", async () => {
    const h = create_panel_harness({ open_note_path: "notes/plan.md" });
    h.chat_store.add_user_message("earlier question");

    await h.registry.execute(ACTION_IDS.assistant_open_panel);

    expect(h.chat_store.scope.notes).toBeUndefined();
  });

  it("leaves a user-set scope alone", async () => {
    const h = create_panel_harness({ open_note_path: "notes/plan.md" });
    h.chat_store.set_scope({ folders: ["projects/"] });

    await h.registry.execute(ACTION_IDS.assistant_open_panel);

    expect(h.chat_store.scope).toEqual({ folders: ["projects/"] });
  });

  it("keeps an already-chosen provider", async () => {
    const h = create_panel_harness({ provider_id: "claude" });

    await h.registry.execute(ACTION_IDS.assistant_open_panel);

    expect(h.resolve_provider).not.toHaveBeenCalled();
    expect(h.chat_store.provider_id).toBe("claude");
  });
});
