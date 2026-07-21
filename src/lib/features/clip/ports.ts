import type { VaultId } from "$lib/shared/types/ids";

export type ClipPage = {
  final_url: string;
  html: string;
  content_type: string;
};

export type ClipAsset = {
  bytes: Uint8Array;
  content_type: string;
};

export type ClipEpubImage = {
  href: string;
  asset_path: string;
  media_type: string;
};

export type ClipEpubInput = {
  title: string;
  source_url: string;
  clipped_at: string;
  xhtml: string;
  images: ClipEpubImage[];
};

export type ClipFetchErrorKind = "blocked" | "other";

export class ClipFetchError extends Error {
  constructor(
    message: string,
    public readonly kind: ClipFetchErrorKind,
  ) {
    super(message);
    this.name = "ClipFetchError";
  }
}

export interface ClipPort {
  fetch_page(url: string): Promise<ClipPage>;
  fetch_asset(url: string): Promise<ClipAsset>;
  write_epub(
    vault_id: VaultId,
    epub_path: string,
    input: ClipEpubInput,
  ): Promise<void>;
  capture_start(url: string): Promise<void>;
  capture_finish(): Promise<ClipPage>;
  capture_cancel(): Promise<void>;
  on_capture_closed(handler: () => void): Promise<() => void>;
}
