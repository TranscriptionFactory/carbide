import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import { assistant_session_tab_id } from "$lib/features/tab";
import type { AssistantKernelService } from "$lib/features/assistant/application/assistant_kernel_service";
import type { AssistantSessionStore } from "$lib/features/assistant/state/assistant_session_store.svelte";
import type { RunId } from "$lib/features/assistant/types/run";

export function register_assistant_actions(
  input: ActionRegistrationInput & {
    assistant_kernel: AssistantKernelService;
    assistant_sessions: AssistantSessionStore;
  },
) {
  const { registry, assistant_kernel, assistant_sessions, stores } = input;

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
}
