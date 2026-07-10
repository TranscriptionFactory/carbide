import { resolve_relative_asset_path } from "$lib/features/note";
import { create_logger } from "$lib/shared/utils/logger";
import { extract_note_image_targets } from "../domain/note_image_refs";
import type { AiImagePart } from "../domain/ai_stream_types";

const log = create_logger("note_image_loader");

export const MAX_NOTE_IMAGES = 5;
export const MAX_NOTE_IMAGE_BYTES = 4 * 1024 * 1024;

export type CollectNoteImagePartsInput = {
  note_path: string;
  markdown: string;
  vault_id: string;
  resolve_asset_url: (vault_id: string, file_path: string) => string;
};

function bytes_to_base64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export async function collect_note_image_parts(
  input: CollectNoteImagePartsInput,
): Promise<AiImagePart[]> {
  const targets = extract_note_image_targets(input.markdown).slice(
    0,
    MAX_NOTE_IMAGES,
  );
  const parts: AiImagePart[] = [];

  for (const target of targets) {
    try {
      const vault_relative = resolve_relative_asset_path(
        input.note_path,
        decodeURIComponent(target),
      );
      const url = input.resolve_asset_url(input.vault_id, vault_relative);
      const response = await fetch(url);
      if (!response.ok) {
        log.warn("Skipping AI image: fetch failed", { target });
        continue;
      }
      const blob = await response.blob();
      if (!blob.type.startsWith("image/") || blob.size > MAX_NOTE_IMAGE_BYTES) {
        continue;
      }
      const bytes = new Uint8Array(await blob.arrayBuffer());
      parts.push({
        type: "image",
        media_type: blob.type,
        data: bytes_to_base64(bytes),
      });
    } catch (error) {
      log.warn("Skipping AI image: load failed", { target, error });
    }
  }

  return parts;
}
