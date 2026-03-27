export function carbide_asset_url(
  vault_id: string,
  asset_path: string,
): string {
  const encoded = String(asset_path)
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `carbide-asset://vault/${vault_id}/${encoded}`;
}

export function carbide_file_asset_url(absolute_path: string): string {
  const encoded = String(absolute_path)
    .split("/")
    .filter(Boolean)
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `carbide-asset://file/${encoded}`;
}
