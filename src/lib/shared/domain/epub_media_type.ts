const MEDIA_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};

export function epub_media_type(ext: string): string {
  return MEDIA_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}
