import type { ActionRegistry } from "$lib/app/action_registry/action_registry";
import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ToolchainService } from "$lib/features/toolchain/application/toolchain_service";

export function register_toolchain_actions(input: {
  registry: ActionRegistry;
  toolchain_service: ToolchainService;
}): void {
  const { registry, toolchain_service } = input;

  registry.register({
    id: ACTION_IDS.toolchain_install,
    label: "Toolchain: Install Tool",
    execute: async (...args: unknown[]) => {
      const tool_id = args[0] as string | undefined;
      if (!tool_id) return;
      await toolchain_service.install(tool_id);
    },
  });

  registry.register({
    id: ACTION_IDS.toolchain_manage,
    label: "Toolchain: Manage Tools",
    execute: () => {
      void registry.execute(ACTION_IDS.settings_open, "toolchain");
    },
  });
}
