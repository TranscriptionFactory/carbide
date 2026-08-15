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
import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type { AssistantRunStore } from "$lib/features/assistant/state/assistant_run_store.svelte";
import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { RunId } from "$lib/features/assistant/types/run";

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

export function register_assistant_actions(
  input: ActionRegistrationInput & {
    assistant_kernel: AssistantKernelService;
    assistant_runs: AssistantRunStore;
    assistant_sessions: AssistantSessionStore;
    assistant_proposals: AssistantProposalStore;
    proposal_apply: ProposalApplyService;
    chat_store: AssistantChatStore;
    active_document_path: () => string | null;
  },
) {
  const {
    registry,
    assistant_kernel,
    assistant_runs,
    assistant_sessions,
    assistant_proposals,
    proposal_apply,
    chat_store,
    active_document_path,
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

  registry.register({
    id: ACTION_IDS.assistant_open_session,
    label: "Open Assistant Session",
    execute: (...args: unknown[]) => {
      const session_id = typeof args[0] === "string" ? args[0] : "";
      if (!session_id) return;
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
