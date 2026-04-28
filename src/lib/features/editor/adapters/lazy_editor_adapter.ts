import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import type { EditorPort } from "$lib/features/editor/ports";
import type { YDocManager } from "./ydoc_manager";
import type { SlashCommandConfig } from "./slash_command_plugin";
import type { AiMenuPluginConfig } from "./ai_menu_plugin";
import type { TaskPort } from "$lib/features/task";
import type { VaultFsEvent } from "$lib/features/watcher";

type ResolveAssetUrlForVault = (
  vault_id: VaultId,
  asset_path: AssetPath,
) => string | Promise<string>;

export function create_lazy_editor_port(args?: {
  resolve_asset_url_for_vault?: ResolveAssetUrlForVault;
  load_svg_preview?: (vault_id: string, path: string) => Promise<string | null>;
  ydoc_manager?: YDocManager;
  slash_config?: SlashCommandConfig;
  ai_inline_config?: AiMenuPluginConfig;
  task_port?: TaskPort;
  note_embed?: {
    read_note: (vault_id: string, note_path: string) => Promise<string>;
    subscribe_to_changes: (
      handler: (event: VaultFsEvent) => void,
    ) => () => void;
  };
}): EditorPort {
  let port_promise: Promise<EditorPort> | null = null;

  const load_port = (): Promise<EditorPort> =>
    (port_promise ??=
      import("$lib/features/editor/adapters/prosemirror_adapter").then((mod) =>
        mod.create_prosemirror_editor_port(args),
      ));

  return {
    start_session: async (config) => {
      const port = await load_port();
      return port.start_session(config);
    },
  };
}
