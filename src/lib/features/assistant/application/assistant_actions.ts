import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  ASSISTANT_PROPOSALS_TAB_ID,
  ASSISTANT_PROPOSALS_TAB_TITLE,
  assistant_session_tab_id,
} from "$lib/features/tab";
import { scope_is_empty } from "$lib/features/assistant/types/session";
import { prime_chat_store } from "$lib/features/assistant/application/chat_actions";
import { sync_changed_notes } from "$lib/features/assistant/application/note_sync_actions";
import { toast } from "$lib/shared/ui/toast";
import type { AssistantChatStore } from "$lib/features/assistant/state/assistant_chat_store.svelte";
import type { AssistantKernelService } from "$lib/features/assistant/application/assistant_kernel_service";
import type {
  ProposalApplyOutcome,
  ProposalApplyService,
} from "$lib/features/assistant/application/proposal_apply_service";
import type {
  ProposalRevertOutcome,
  ProposalRevertService,
} from "$lib/features/assistant/application/proposal_revert_service";
import { describe_turn_revert } from "$lib/features/assistant/domain/proposal_turns";
import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { AssistantSessionService } from "$lib/features/assistant/application/assistant_session_service";
import { ensure_assistant_session_loaded } from "$lib/features/assistant/application/assistant_sessions_load";
import type { RunId } from "$lib/features/assistant/types/run";
import { UnattendedRunService } from "$lib/features/assistant/application/unattended_run_service";

// Accept used to discard its outcome entirely, so a stale or failed apply was
// indistinguishable from a clean one: nothing changed on disk and nothing was
// said. Silence stays the report for a clean apply — the review centre already
// shows that — but the two ways an accept can decline to write must be visible.
function report_apply_outcome(outcome: ProposalApplyOutcome) {
  if (outcome.failed.length > 0) {
    toast.error(
      outcome.failed.length === 1
        ? "Could not apply the proposal"
        : `Could not apply ${String(outcome.failed.length)} proposals`,
      { description: outcome.failed[0]?.error ?? "" },
    );
  }
  if (outcome.stale.length > 0) {
    toast.warning(
      outcome.stale.length === 1
        ? "Proposal is out of date"
        : `${String(outcome.stale.length)} proposals are out of date`,
      {
        description:
          "The note changed after the draft was made, so nothing was applied.",
      },
    );
  }
}

// A revert that did its work is silent like a clean apply — the turn row
// flips to reverted. The three ways it can decline must each say why.
function report_revert_outcome(outcome: ProposalRevertOutcome) {
  switch (outcome.status) {
    case "reverted":
      if (outcome.failed.length > 0) {
        toast.error(
          outcome.failed.length === 1
            ? "Could not restore one note"
            : `Could not restore ${String(outcome.failed.length)} notes`,
          { description: outcome.failed[0]?.error ?? "" },
        );
      }
      return;
    case "needs_confirmation":
      toast.warning("This revert needs confirmation", {
        description: describe_turn_revert(outcome.plan),
      });
      return;
    case "refused":
      toast.error("Could not revert", { description: outcome.reason });
      return;
    case "nothing":
      return;
  }
}

export function register_assistant_actions(
  input: ActionRegistrationInput & {
    assistant_kernel: AssistantKernelService;
    assistant_runs: AssistantRunStore;
    assistant_sessions: AssistantSessionStore;
    session_service: AssistantSessionService;
    assistant_proposals: AssistantProposalStore;
    proposal_apply: ProposalApplyService;
    proposal_revert: ProposalRevertService;
    chat_store: AssistantChatStore;
    active_document_path: () => string | null;
    unattended_runs: UnattendedRunService;
  },
) {
  const {
    registry,
    assistant_kernel,
    assistant_runs,
    assistant_sessions,
    session_service,
    assistant_proposals,
    proposal_apply,
    proposal_revert,
    chat_store,
    active_document_path,
    unattended_runs,
    stores,
  } = input;

  registry.register({
    id: ACTION_IDS.assistant_open_panel,
    label: "Assistant",
    execute: async () => {
      await prime_chat_store(
        chat_store,
        assistant_kernel,
        stores.ui.editor_settings,
      );

      stores.ui.bottom_panel_tab = "assistant";
      stores.ui.bottom_panel_open = true;

      // SEED only an untouched conversation: never re-scope one in progress,
      // and a user-set scope or attachment always wins.
      const scope = chat_store.scope;
      if (
        chat_store.messages.length > 0 ||
        !scope_is_empty(scope) ||
        chat_store.attached_document
      ) {
        return;
      }

      const document_path = active_document_path();
      if (document_path) {
        await registry.execute(
          ACTION_IDS.assistant_attach_document,
          document_path,
        );
        return;
      }
      const note = stores.editor.open_note;
      if (note) {
        chat_store.set_scope({ ...scope, notes: [String(note.meta.path)] });
      }
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_stop_run,
    label: "Stop Assistant Run",
    execute: (...args: unknown[]) => {
      const run_id = typeof args[0] === "string" ? (args[0] as RunId) : "";
      if (!run_id) return;
      assistant_kernel.stop(run_id);
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_stop_all_runs,
    label: "Stop All Assistant Runs",
    execute: () => {
      assistant_kernel.stop_all();
    },
  });

  // A terminated record is inert bookkeeping — the kernel released its
  // controller when the run settled — so discarding one frees a row, not a
  // process. Live runs are left alone; stopping is a separate intention.
  registry.register({
    id: ACTION_IDS.assistant_clear_runs,
    label: "Clear Finished Assistant Runs",
    execute: () => {
      assistant_runs.clear_terminated();
    },
  });

  // Explicit intent, so it deliberately does NOT consult the trigger toggle or
  // the folder: those gate the automatic trigger, not the user asking for a run.
  // The run is still proposal-only, on the same gate as a triggered one.
  registry.register({
    id: ACTION_IDS.assistant_run_unattended_now,
    label: "Run Unattended Assistant Now",
    execute: async () => {
      const result = await unattended_runs.run({
        kind: "manual",
        note_path: null,
        folder: null,
      });
      if (result.status === "refused") {
        toast.warning("Unattended run not started", {
          description: result.reason,
        });
      }
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_open_session,
    label: "Open Assistant Session",
    execute: async (...args: unknown[]) => {
      const session_id = typeof args[0] === "string" ? args[0] : "";
      if (!session_id) return;
      await ensure_assistant_session_loaded(
        assistant_sessions,
        session_service,
        session_id,
      );
      const session = assistant_sessions.get(session_id);
      if (!session) return;
      stores.tab.open_assistant_session_tab(
        assistant_session_tab_id(session_id),
        session.title,
        session_id,
      );
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_open_proposals,
    label: "Open Proposal Review",
    execute: () => {
      stores.tab.open_assistant_proposals_tab(
        ASSISTANT_PROPOSALS_TAB_ID,
        ASSISTANT_PROPOSALS_TAB_TITLE,
      );
    },
  });

  // A note proposal writes disk behind the editor's back and the watcher's
  // event for that write is suppressed as a self-write, so nothing would
  // reconcile the open buffer — the user saw the old text until they closed
  // and reopened the tab. The agent path already solved this; both now run the
  // same policy through sync_changed_notes.
  async function apply_and_report(ids: string[]) {
    const outcome = await proposal_apply.apply_batch(ids);
    await sync_changed_notes(input, outcome.written_note_paths);
    report_apply_outcome(outcome);
  }

  registry.register({
    id: ACTION_IDS.assistant_accept_proposal,
    label: "Accept Proposal",
    execute: async (...args: unknown[]) => {
      const proposal_id = typeof args[0] === "string" ? args[0] : "";
      if (!proposal_id) return;
      await apply_and_report([proposal_id]);
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_accept_proposals,
    label: "Accept Proposals",
    execute: async (...args: unknown[]) => {
      const proposal_ids = Array.isArray(args[0])
        ? args[0].filter((id): id is string => typeof id === "string")
        : [];
      if (proposal_ids.length === 0) return;
      await apply_and_report(proposal_ids);
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_reject_proposal,
    label: "Reject Proposal",
    execute: async (...args: unknown[]) => {
      const proposal_id = typeof args[0] === "string" ? args[0] : "";
      if (!proposal_id) return;
      await proposal_apply.reject_batch([proposal_id]);
    },
  });

  // The restored notes reach the editor the same way applied ones do.
  async function revert_and_report(outcome: ProposalRevertOutcome) {
    if (outcome.status === "reverted") {
      await sync_changed_notes(input, outcome.restored_note_paths);
    }
    report_revert_outcome(outcome);
  }

  registry.register({
    id: ACTION_IDS.assistant_revert_turn,
    label: "Revert Agent Turn",
    execute: async (...args: unknown[]) => {
      const turn_id = typeof args[0] === "string" ? args[0] : "";
      if (!turn_id) return;
      const confirmed = args[1] === true;
      await revert_and_report(
        await proposal_revert.revert_turn(turn_id, { confirmed }),
      );
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_revert_session,
    label: "Revert Agent Session Edits",
    execute: async (...args: unknown[]) => {
      const session_id = typeof args[0] === "string" ? args[0] : "";
      if (!session_id) return;
      const confirmed = args[1] === true;
      await revert_and_report(
        await proposal_revert.revert_session(session_id, { confirmed }),
      );
    },
  });

  registry.register({
    id: ACTION_IDS.assistant_set_proposal_hunk_selected,
    label: "Set Proposal Hunk Selected",
    execute: (...args: unknown[]) => {
      const proposal_id = typeof args[0] === "string" ? args[0] : "";
      const hunk_id = typeof args[1] === "string" ? args[1] : "";
      const selected = typeof args[2] === "boolean" ? args[2] : null;
      if (!proposal_id || !hunk_id || selected === null) return;
      assistant_proposals.set_hunk_selected(proposal_id, hunk_id, selected);
    },
  });
}
