import type { ImageSourceKind } from "$lib/features/document/domain/note_html";
import { resolve_relative_asset_path } from "$lib/features/note";

const EXTERNAL_SRC_PATTERN = /^(data:|https?:\/\/|\/)/i;

// Markdown image sources are relative to the note; wiki embeds are already
// vault-relative. Remote, data and filesystem-absolute sources have no vault
// asset behind them.
export function resolve_note_asset_path(
  note_path: string,
  src: string,
  kind: ImageSourceKind,
): string | null {
  if (EXTERNAL_SRC_PATTERN.test(src)) return null;
  const decoded = decodeURIComponent(src);
  if (kind === "wiki") return decoded;
  return resolve_relative_asset_path(note_path, decoded);
}
