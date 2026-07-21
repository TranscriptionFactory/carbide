import type {
  ClipAsset,
  ClipEpubInput,
  ClipPage,
  ClipPort,
} from "$lib/features/clip/ports";
import type { VaultId } from "$lib/shared/types/ids";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

export function create_clip_tauri_adapter(): ClipPort {
  return {
    async fetch_page(url: string): Promise<ClipPage> {
      return tauri_invoke<ClipPage>("clip_fetch_page", { url });
    },
    async fetch_asset(url: string): Promise<ClipAsset> {
      const asset = await tauri_invoke<{
        bytes: number[];
        content_type: string;
      }>("clip_fetch_asset", { url });
      return {
        bytes: new Uint8Array(asset.bytes),
        content_type: asset.content_type,
      };
    },
    async write_epub(
      vault_id: VaultId,
      epub_path: string,
      input: ClipEpubInput,
    ): Promise<void> {
      return tauri_invoke<void>("clip_write_epub", {
        vaultId: vault_id,
        epubPath: epub_path,
        input,
      });
    },
  };
}
