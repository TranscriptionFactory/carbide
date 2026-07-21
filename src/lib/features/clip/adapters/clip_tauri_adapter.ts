import { listen } from "@tauri-apps/api/event";
import {
  ClipFetchError,
  type ClipAsset,
  type ClipEpubInput,
  type ClipPage,
  type ClipPort,
} from "$lib/features/clip/ports";
import type { VaultId } from "$lib/shared/types/ids";
import { tauri_invoke } from "$lib/shared/adapters/tauri_invoke";

function to_clip_fetch_error(error: unknown): ClipFetchError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    const { kind, message } = error as { kind: unknown; message: unknown };
    return new ClipFetchError(
      String(message),
      kind === "blocked" ? "blocked" : "other",
    );
  }
  return new ClipFetchError(String(error), "other");
}

export function create_clip_tauri_adapter(): ClipPort {
  return {
    async fetch_page(url: string): Promise<ClipPage> {
      try {
        return await tauri_invoke<ClipPage>("clip_fetch_page", { url });
      } catch (error) {
        throw to_clip_fetch_error(error);
      }
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
    async capture_start(url: string): Promise<void> {
      return tauri_invoke<void>("clip_capture_start", { url });
    },
    async capture_finish(): Promise<ClipPage> {
      return tauri_invoke<ClipPage>("clip_capture_finish");
    },
    async capture_cancel(): Promise<void> {
      return tauri_invoke<void>("clip_capture_cancel");
    },
    async on_capture_closed(handler: () => void): Promise<() => void> {
      return listen("clip:capture-closed", handler);
    },
  };
}
