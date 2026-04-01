import type { LinkedSourceMeta } from "../types";

function posix_relative(from: string, to: string): string {
  const from_parts = from.split("/").filter(Boolean);
  const to_parts = to.split("/").filter(Boolean);
  let common = 0;
  while (
    common < from_parts.length &&
    common < to_parts.length &&
    from_parts[common] === to_parts[common]
  ) {
    common++;
  }
  const ups = from_parts.length - common;
  const rest = to_parts.slice(common);
  const segments = [...Array(ups).fill(".."), ...rest];
  return segments.join("/") || ".";
}

function posix_resolve(base: string, rel: string): string {
  if (rel.startsWith("/")) return rel;
  const parts = base.split("/").filter(Boolean);
  for (const seg of rel.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== ".") parts.push(seg);
  }
  return "/" + parts.join("/");
}

export function compute_vault_relative_path(
  file_path: string,
  vault_root: string,
): string | undefined {
  if (!file_path || !vault_root) return undefined;
  const rel = posix_relative(vault_root, file_path);
  if (rel.startsWith("/") || rel === file_path) return undefined;
  return rel;
}

export function compute_home_relative_path(
  file_path: string,
  home_dir: string,
): string | undefined {
  if (!file_path || !home_dir) return undefined;
  const normalized_home = home_dir.endsWith("/") ? home_dir : home_dir + "/";
  if (!file_path.startsWith(normalized_home)) return undefined;
  return "~/" + file_path.slice(normalized_home.length);
}

export function resolve_linked_path(
  meta: LinkedSourceMeta,
  vault_root: string,
  home_dir: string,
): string | null {
  if (meta.external_file_path) return meta.external_file_path;

  if (meta.vault_relative_path && vault_root) {
    return posix_resolve(vault_root, meta.vault_relative_path);
  }

  if (meta.home_relative_path && home_dir) {
    return meta.home_relative_path.replace(/^~/, home_dir);
  }

  return null;
}

export function enrich_meta_with_paths(
  meta: LinkedSourceMeta,
  vault_root: string,
  home_dir: string,
): LinkedSourceMeta {
  if (!meta.external_file_path) return meta;
  const vault_rel = compute_vault_relative_path(
    meta.external_file_path,
    vault_root,
  );
  const home_rel = compute_home_relative_path(
    meta.external_file_path,
    home_dir,
  );
  const result: LinkedSourceMeta = { ...meta };
  if (vault_rel !== undefined) result.vault_relative_path = vault_rel;
  if (home_rel !== undefined) result.home_relative_path = home_rel;
  return result;
}
