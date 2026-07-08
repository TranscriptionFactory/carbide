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

type PortableAnchors = {
  vault_relative_path?: string;
  home_relative_path?: string;
};

// Anchors are ordered most- to least-portable: vault-relative survives any
// mount-point difference as long as the target moves together with the vault
// (e.g. siblings in a shared iCloud folder that participants place at
// different locations), home-relative survives username differences, and the
// absolute path is whatever the last machine saw.
function anchor_candidates(
  anchors: PortableAnchors,
  absolute: string | undefined,
  home_dir: string,
  vault_root: string,
): string[] {
  const candidates: string[] = [];
  if (anchors.vault_relative_path && vault_root) {
    candidates.push(posix_resolve(vault_root, anchors.vault_relative_path));
  }
  if (anchors.home_relative_path && home_dir) {
    candidates.push(anchors.home_relative_path.replace(/^~/, home_dir));
  }
  if (absolute) candidates.push(absolute);
  return [...new Set(candidates)];
}

// `external_file_path` is a cache hint, not the source of truth: it is the
// absolute path recorded by the machine that indexed the file and may point at
// a location that does not exist on another machine. Prefer the portable
// anchors (vault-relative, then home-relative) and fall back to the cached
// absolute path only when no anchor is available. Callers that need an existing
// file (open/preview) should validate the result against the filesystem.
export function resolve_linked_path(
  meta: LinkedSourceMeta,
  vault_root: string,
  home_dir: string,
): string | null {
  return (
    anchor_candidates(meta, meta.external_file_path, home_dir, vault_root)[0] ??
    null
  );
}

// Callers that can touch the filesystem should probe candidates in order and
// keep the first that exists.
export function linked_source_root_candidates(
  source: { path: string } & PortableAnchors,
  home_dir: string,
  vault_root: string,
): string[] {
  return anchor_candidates(source, source.path, home_dir, vault_root);
}

export function compute_source_anchors(
  path: string,
  home_dir: string,
  vault_root: string,
): { path: string } & PortableAnchors {
  const hrp = compute_home_relative_path(path, home_dir);
  const vrp = compute_vault_relative_path(path, vault_root);
  return {
    path,
    ...(hrp ? { home_relative_path: hrp } : {}),
    ...(vrp ? { vault_relative_path: vrp } : {}),
  };
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
