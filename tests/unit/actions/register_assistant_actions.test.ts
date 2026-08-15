import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "svelte-sonner";
import { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import {
  AssistantChatStore,
  AssistantProposalStore,
  AssistantRunStore,
  AssistantSessionStore,
  register_assistant_actions,
} from "$lib/features/assistant";
import { TabStore } from "$lib/features/tab/state/tab_store.svelte";
import { UIStore } from "$lib/app/orchestration/ui_store.svelte";
import type { ProposalApplyOutcome } from "$lib/features/assistant";
import {
  make_proposal,
  make_proposal_hunk,
} from "../helpers/assistant_proposal_fixtures";

vi.mock("svelte-sonner", () => ({
  toast: {
    info: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    success: vi.fn(),
  },
}));

function make_outcome(
  overrides: Partial<ProposalApplyOutcome> = {},
): ProposalApplyOutcome {
  return {
    applied: [],
    stale: [],
    failed: [],
    checkpoint: null,
    written_note_paths: [],
    ...overrides,
  };
}

type HarnessOptions = {
  outcome?: ProposalApplyOutcome;
  open_note?: { path: string; is_dirty: boolean } | null;
};

function create_harness(options: HarnessOptions = {}) {
  const registry = new ActionRegistry();
  const sessions = new AssistantSessionStore();
  const proposals = new AssistantProposalStore();
  const runs = new AssistantRunStore();
  const tab = new TabStore();
  const proposal_apply = {
    apply_batch: vi.fn().mockResolvedValue(options.outcome ?? make_outcome()),
    reject_batch: vi.fn().mockResolvedValue(undefined),
  };
  const editor = {
    open_note: options.open_note
      ? {
          meta: { path: options.open_note.path },
          is_dirty: options.open_note.is_dirty,
        }
      : null,
  };
  const services = {
    editor: { close_buffer: vi.fn() },
    note: {
      open_note: vi.fn().mockResolvedValue({ status: "ok" }),
      clear_open_note: vi.fn(),
    },
    tab: {
      mark_conflict: vi.fn(),
      invalidate_cache: vi.fn(),
      remove_tab: vi.fn(),
    },
  };

  register_assistant_actions({
    registry,
    stores: { tab, editor } as never,
    services: services as never,
    default_mount_config: {
      reset_app_state: true,
      bootstrap_default_vault_path: null,
    },
    assistant_kernel: { stop: vi.fn(), stop_all: vi.fn() } as never,
    assistant_runs: runs,
    assistant_sessions: sessions,
    assistant_proposals: proposals,
    proposal_apply: proposal_apply as never,
    chat_store: new AssistantChatStore(sessions),
    active_document_path: () => null,
  });

  return { registry, proposals, proposal_apply, runs, services };
}

describe("register_assistant_actions — assistant_clear_runs", () => {
  const spec = {
    kind: "chat",
    label: "q",
    request: { mode: "text", system_prompt: "", messages: [] },
  } as never;

  it("discards terminated records and keeps live ones", async () => {
    const { registry, runs } = create_harness();
    runs.start("done-run", spec, 1);
    runs.set_status("done-run", "done");
    runs.start("failed-run", spec, 2);
    runs.set_error("failed-run", { message: "boom", detail: "boom" });
    runs.start("live-run", spec, 3);
    runs.set_status("live-run", "streaming");

    await registry.execute(ACTION_IDS.assistant_clear_runs);

    expect(runs.all.map((run) => run.id)).toEqual(["live-run"]);
    expect(runs.has_error).toBe(false);
  });
});

// A note proposal writes disk with the watcher suppressed, so accept is the
// only thing that can reconcile the open buffer. Before this, the editor kept
// showing the pre-apply text until the tab was closed and reopened.
describe("register_assistant_actions — apply reconciles the open editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reloads the open note when the applied proposal wrote it", async () => {
    const { registry, services } = create_harness({
      open_note: { path: "note.md", is_dirty: false },
      outcome: make_outcome({
        applied: ["p1"],
        written_note_paths: ["note.md"],
      }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

    expect(services.editor.close_buffer).toHaveBeenCalledWith("note.md");
    expect(services.note.open_note).toHaveBeenCalledWith("note.md", false, {
      force_reload: true,
      cleanup_if_missing: true,
    });
    expect(services.tab.mark_conflict).not.toHaveBeenCalled();
  });

  // Y3: reloading over a dirty buffer would throw away the user's unsaved
  // edits, and leaving it alone lets autosave write them back over the applied
  // content. The agent path raises a conflict here; so does this one now.
  it("raises a conflict instead of reloading when the open buffer is dirty", async () => {
    const { registry, services } = create_harness({
      open_note: { path: "note.md", is_dirty: true },
      outcome: make_outcome({
        applied: ["p1"],
        written_note_paths: ["note.md"],
      }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

    expect(services.tab.mark_conflict).toHaveBeenCalledWith("note.md");
    expect(services.editor.close_buffer).not.toHaveBeenCalled();
    expect(services.note.open_note).not.toHaveBeenCalled();
  });

  it("leaves the editor alone when the applied proposal wrote no note", async () => {
    const { registry, services } = create_harness({
      open_note: { path: "note.md", is_dirty: false },
      outcome: make_outcome({ applied: ["p1"] }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

    expect(services.editor.close_buffer).not.toHaveBeenCalled();
    expect(services.tab.mark_conflict).not.toHaveBeenCalled();
  });

  it("reconciles every note a batch accept wrote", async () => {
    const { registry, services } = create_harness({
      open_note: { path: "second.md", is_dirty: false },
      outcome: make_outcome({
        applied: ["p1", "p2"],
        written_note_paths: ["first.md", "second.md"],
      }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposals, ["p1", "p2"]);

    expect(services.editor.close_buffer).toHaveBeenCalledExactlyOnceWith(
      "second.md",
    );
  });
});

// S6: the outcome used to be discarded, so an accept that applied nothing at
// all looked exactly like one that worked.
describe("register_assistant_actions — accept surfaces its outcome", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("warns that a stale proposal applied nothing", async () => {
    const { registry } = create_harness({
      outcome: make_outcome({ stale: ["p1"] }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

    expect(toast.warning).toHaveBeenCalledWith("Proposal is out of date", {
      description:
        "The note changed after the draft was made, so nothing was applied.",
    });
  });

  it("reports a failed apply with the underlying reason", async () => {
    const { registry } = create_harness({
      outcome: make_outcome({
        failed: [{ id: "p1", error: "conflict:mtime_mismatch" }],
      }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

    expect(toast.error).toHaveBeenCalledWith("Could not apply the proposal", {
      description: "conflict:mtime_mismatch",
    });
  });

  it("counts a batch that went stale", async () => {
    const { registry } = create_harness({
      outcome: make_outcome({ stale: ["p1", "p2"] }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposals, ["p1", "p2"]);

    expect(toast.warning).toHaveBeenCalledWith(
      "2 proposals are out of date",
      expect.anything(),
    );
  });

  it("says nothing when everything applied", async () => {
    const { registry } = create_harness({
      outcome: make_outcome({
        applied: ["p1"],
        written_note_paths: ["note.md"],
      }),
    });

    await registry.execute(ACTION_IDS.assistant_accept_proposal, "p1");

    expect(toast.warning).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

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
      assistant_runs: new AssistantRunStore(),
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
