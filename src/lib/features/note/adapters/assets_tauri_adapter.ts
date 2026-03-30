import type { AssetsPort } from "$lib/features/note/ports";
import type { AssetPath, VaultId } from "$lib/shared/types/ids";
import {
  carbide_asset_url,
  carbide_file_asset_url,
} from "$lib/features/note/domain/asset_url";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";
import { as_asset_path } from "$lib/shared/types/ids";

function build_write_image_asset_args(
  vault_id: VaultId,
  input: Parameters<AssetsPort["write_image_asset"]>[1],
) {
  return {
    vault_id,
    note_path: input.note_path,
    mime_type: input.image.mime_type,
    file_name: input.image.file_name,
    bytes: Array.from(input.image.bytes),
    custom_filename: input.custom_filename,
    attachment_folder: input.attachment_folder,
  };
}

export function create_assets_tauri_adapter(): AssetsPort {
  return {
    resolve_asset_url(vault_id: VaultId, asset_path: AssetPath) {
      if (asset_path.startsWith("/")) {
        return carbide_file_asset_url(asset_path);
      }
      return carbide_asset_url(vault_id, asset_path);
    },
    async write_image_asset(vault_id, input) {
      const asset_path = await tauri_invoke<string>("write_image_asset", {
        args: build_write_image_asset_args(vault_id, input),
      });

      return as_asset_path(asset_path);
    },
    async search_assets(vault_id, query, limit) {
      return tauri_invoke<string[]>("search_vault_assets", {
        vaultId: vault_id,
        query,
        limit,
      });
    },
    async invalidate_asset_cache(vault_id, asset_path) {
      return tauri_invoke<void>("invalidate_asset_cache", {
        vaultId: vault_id,
        assetPath: asset_path,
      });
    },
  };
}
