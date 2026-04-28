import type { Plugin } from "prosemirror-state";
import type { Node as ProseNode } from "prosemirror-model";
import type { EditorEventHandlers } from "$lib/features/editor/ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import type { TaskQueryCallbacks } from "../adapters/code_block_view_plugin";
import type { VaultFsEvent } from "$lib/features/watcher";

export type ResolveAssetUrlForVault = (
  vault_id: VaultId,
  asset_path: AssetPath,
) => string | Promise<string>;

export type NoteEmbedContext = {
  read_note: (note_path: string) => Promise<string>;
  parse_markdown: (markdown: string) => ProseNode;
  subscribe_to_changes: (handler: (event: VaultFsEvent) => void) => () => void;
};

export type PluginContext = {
  events: EditorEventHandlers;
  get_note_path: () => string;
  get_vault_id: () => VaultId | null;
  get_markdown: () => string;
  resolve_asset_url_for_vault: ResolveAssetUrlForVault | null;
  load_svg_preview?:
    | ((vault_id: string, path: string) => Promise<string | null>)
    | undefined;
  use_yjs?: boolean;
  native_link_hover_enabled?: boolean;
  native_wiki_suggest_enabled?: boolean;
  native_link_click_enabled?: boolean;
  task_query_callbacks?: TaskQueryCallbacks;
  note_embed?: NoteEmbedContext;
};

export type EditorExtension = {
  plugins: Plugin[];
  on_note_path_change?: (path: string) => void;
};

export type EditorExtensionFactory = (ctx: PluginContext) => EditorExtension;
