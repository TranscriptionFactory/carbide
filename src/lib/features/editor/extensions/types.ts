import type { Plugin } from "prosemirror-state";
import type { EditorEventHandlers } from "$lib/features/editor/ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";

export type ResolveAssetUrlForVault = (
  vault_id: VaultId,
  asset_path: AssetPath,
) => string | Promise<string>;

export type PluginContext = {
  events: EditorEventHandlers;
  get_note_path: () => string;
  get_vault_id: () => VaultId | null;
  resolve_asset_url_for_vault: ResolveAssetUrlForVault | null;
  load_svg_preview?:
    | ((vault_id: string, path: string) => Promise<string | null>)
    | undefined;
  use_yjs?: boolean;
  native_link_hover_enabled?: boolean;
  native_wiki_suggest_enabled?: boolean;
  native_link_click_enabled?: boolean;
};

export type EditorExtension = {
  plugins: Plugin[];
  on_note_path_change?: (path: string) => void;
};

export type EditorExtensionFactory = (ctx: PluginContext) => EditorExtension;
