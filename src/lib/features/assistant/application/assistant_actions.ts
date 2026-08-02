import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { AssistantKernelService } from "$lib/features/assistant/application/assistant_kernel_service";
import type { RunId } from "$lib/features/assistant/types/run";

export function register_assistant_actions(
  input: ActionRegistrationInput & {
    assistant_kernel: AssistantKernelService;
  },
) {
  const { registry, assistant_kernel } = input;

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
}
