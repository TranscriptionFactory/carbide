import { ACTION_IDS } from "$lib/app/action_registry/action_ids";
import type { ActionRegistrationInput } from "$lib/app/action_registry/action_registration_input";
import type { WindowPort } from "$lib/features/window/ports";

export function register_window_actions(
  input: ActionRegistrationInput & {
    window_port: WindowPort;
  },
) {
  const { registry, stores, window_port } = input;

  registry.register({
    id: ACTION_IDS.window_open_viewer,
    label: "Open Viewer Window",
    execute: async (...args: unknown[]) => {
      const file_path = args[0] as string;
      const vault_path = stores.vault.vault?.path;
      if (!vault_path) return;
      const is_note = /\.(?:md|markdown|mdx)$/i.test(file_path);
      if (is_note) {
        await window_port.open_window({
          kind: "browse",
          vault_path,
          file_path,
        });
      } else {
        await window_port.open_window({
          kind: "viewer",
          vault_path,
          file_path,
        });
      }
    },
  });

  registry.register({
    id: ACTION_IDS.window_open_browse,
    label: "Open Browse Window",
    execute: async () => {
      const vault_path = stores.vault.vault?.path;
      if (!vault_path) return;
      await window_port.open_window({ kind: "browse", vault_path });
    },
  });
}
