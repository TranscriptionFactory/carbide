import type {
  ImageResolver,
  ImageSourceKind,
} from "$lib/features/document/domain/note_html";
import { epub_media_type } from "$lib/shared/domain/epub_media_type";
import type { EpubImage } from "$lib/shared/types/epub";

export type NoteAssetPathResolver = (
  src: string,
  kind: ImageSourceKind,
) => string | null;

export type EpubImageCollector = {
  image_resolver: ImageResolver;
  images: EpubImage[];
};

// Doubles as the note renderer's image resolver: each vault asset it sees is
// registered under an EPUB-internal href, which is what the rendered <img src>
// then points at.
export function create_epub_image_collector(
  resolve_asset_path: NoteAssetPathResolver,
): EpubImageCollector {
  const images: EpubImage[] = [];
  const hrefs = new Map<string, string>();

  const image_resolver: ImageResolver = async (src, kind) => {
    const asset_path = resolve_asset_path(src, kind);
    if (!asset_path) return null;

    const existing = hrefs.get(asset_path);
    if (existing) return existing;

    const ext = asset_path.split(".").pop()?.toLowerCase() || "img";
    const href = `images/img-${String(images.length)}.${ext}`;
    hrefs.set(asset_path, href);
    images.push({ href, asset_path, media_type: epub_media_type(ext) });
    return href;
  };

  return { image_resolver, images };
}
