import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import {
  ASSISTANT_PROPOSALS_TAB_ID,
  ASSISTANT_PROPOSALS_TAB_TITLE,
  assistant_session_tab_id,
} from "$lib/features/tab";
import type { AssistantKernelService } from "$lib/features/assistant/application/assistant_kernel_service";
import type { ProposalApplyService } from "$lib/features/assistant/application/proposal_apply_service";
import type { AssistantProposalStore } from "$lib/features/assistant/state/assistant_proposal_store.svelte";
import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { RunId } from "$lib/features/assistant/types/run";

export function register_assistant_actions(
  input: ActionRegistrationInput & {
    assistant_kernel: AssistantKernelService;
    assistant_sessions: AssistantSessionStore;
    assistant_proposals: AssistantProposalStore;
    proposal_apply: ProposalApplyService;
  },
) {
  const {
    registry,
    assistant_kernel,
    assistant_sessions,
    assistant_proposals,
    proposal_apply,
    stores,
  } = input;

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

  registry.register({
    id: ACTION_IDS.assistant_accept_proposal,
    label: "Accept Proposal",
    execute: async (...args: unknown[]) => {
      const proposal_id = typeof args[0] === "string" ? args[0] : "";
      if (!proposal_id) return;
      await proposal_apply.apply_batch([proposal_id]);
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
      await proposal_apply.apply_batch(proposal_ids);
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
