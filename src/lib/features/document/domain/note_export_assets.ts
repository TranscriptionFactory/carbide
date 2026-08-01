import type { ImageSourceKind } from "$lib/features/document/domain/note_html";
import { resolve_relative_asset_path } from "$lib/features/note";

export function is_remote_image_src(src: string): boolean {
  return /^(data:|https?:\/\/)/i.test(src);
}

// Markdown image sources are relative to the note; wiki embeds are already
// vault-relative. Absolute ("/foo.png") and remote sources have no vault asset.
export function resolve_note_asset_path(
  note_path: string,
  src: string,
  kind: ImageSourceKind,
): string | null {
  if (is_remote_image_src(src) || src.startsWith("/")) return null;
  const decoded = decodeURIComponent(src);
  if (kind === "wiki") return decoded;
  return resolve_relative_asset_path(note_path, decoded);
}
