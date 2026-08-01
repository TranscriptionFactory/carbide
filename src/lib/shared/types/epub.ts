export type EpubImage = {
  href: string;
  asset_path: string;
  media_type: string;
};

export type EpubInput = {
  title: string;
  source_url: string | null;
  created_at: string;
  xhtml: string;
  css: string | null;
  images: EpubImage[];
};
