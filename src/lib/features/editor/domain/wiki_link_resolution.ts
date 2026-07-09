import { to_wiki_link_slug } from "./wiki_link_slug";

function slug_lookup(
  target: string,
  pages: ReadonlySet<string>,
): string | undefined {
  const target_slug = to_wiki_link_slug(target);
  if (!target_slug) return undefined;
  for (const page of pages) {
    if (to_wiki_link_slug(page) === target_slug) return page;
  }
  return undefined;
}

function basename_lookup(
  target: string,
  pages: ReadonlySet<string>,
): string | undefined {
  if (target.includes("/")) return undefined;
  const target_slug = to_wiki_link_slug(target);
  if (!target_slug) return undefined;
  let best_match: string | undefined;
  for (const page of pages) {
    const slash = page.lastIndexOf("/");
    const basename = slash === -1 ? page : page.slice(slash + 1);
    if (to_wiki_link_slug(basename) !== target_slug) continue;
    if (best_match === undefined || page.localeCompare(best_match) < 0) {
      best_match = page;
    }
  }
  return best_match;
}

function wiki_link_resolution_candidates(target: string): string[] {
  const trimmed = target.trim();
  if (!trimmed) return [];
  const slug = to_wiki_link_slug(trimmed);
  return slug.length > 0 && slug !== trimmed ? [slug] : [];
}

function resolve_folder_index_target(
  target: string,
  pages: ReadonlySet<string>,
): string | undefined {
  const canonical = `${target}/index`;
  if (pages.has(canonical)) return canonical;
  const slash_index = target.lastIndexOf("/");
  const leaf = slash_index === -1 ? target : target.slice(slash_index + 1);
  const legacy = leaf ? `${target}/${leaf}` : null;
  if (legacy && pages.has(legacy)) return legacy;
  return undefined;
}

export function resolve_wiki_link_target(
  target: string,
  note_paths: ReadonlySet<string>,
): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) return undefined;
  if (note_paths.has(trimmed)) return trimmed;
  const via_slug = slug_lookup(trimmed, note_paths);
  if (via_slug) return via_slug;
  for (const candidate of wiki_link_resolution_candidates(trimmed)) {
    if (note_paths.has(candidate)) return candidate;
  }
  const folder_index = resolve_folder_index_target(trimmed, note_paths);
  if (folder_index) return folder_index;
  return basename_lookup(trimmed, note_paths);
}

export function resolve_wiki_link_note_path(
  target: string,
  note_paths: Iterable<string>,
): string | null {
  const base_target = (target.split("#", 1)[0] ?? "").split("?", 1)[0] ?? "";
  const doc_target = base_target.replace(/\.md$/i, "");
  if (!doc_target.trim()) return null;

  const doc_name_to_path = new Map<string, string>();
  for (const path of note_paths) {
    const doc_name = path.endsWith(".md") ? path.slice(0, -3) : path;
    doc_name_to_path.set(doc_name, path);
  }

  const resolved = resolve_wiki_link_target(
    doc_target,
    new Set(doc_name_to_path.keys()),
  );
  return resolved ? (doc_name_to_path.get(resolved) ?? null) : null;
}

export function resolve_wiki_file_target(
  target: string,
  file_paths: readonly string[],
): string | undefined {
  const trimmed = target.trim();
  if (!trimmed) return undefined;
  if (file_paths.includes(trimmed)) return trimmed;

  const target_lower = trimmed.toLowerCase();
  let exact_ci: string | undefined;
  for (const path of file_paths) {
    if (path.toLowerCase() !== target_lower) continue;
    if (exact_ci === undefined || path.localeCompare(exact_ci) < 0) {
      exact_ci = path;
    }
  }
  if (exact_ci) return exact_ci;

  if (trimmed.includes("/")) return undefined;
  let best_match: string | undefined;
  for (const path of file_paths) {
    const slash = path.lastIndexOf("/");
    const basename = slash === -1 ? path : path.slice(slash + 1);
    if (basename.toLowerCase() !== target_lower) continue;
    if (best_match === undefined || path.localeCompare(best_match) < 0) {
      best_match = path;
    }
  }
  return best_match;
}

export function is_resolved_wiki_link_target(
  target: string,
  note_paths: ReadonlySet<string>,
): boolean {
  const trimmed = target.trim();
  if (!trimmed) return false;
  if (note_paths.has(trimmed)) return true;
  if (
    wiki_link_resolution_candidates(trimmed).some((candidate) =>
      note_paths.has(candidate),
    )
  ) {
    return true;
  }
  if (slug_lookup(trimmed, note_paths) !== undefined) return true;
  if (resolve_folder_index_target(trimmed, note_paths)) return true;
  return basename_lookup(trimmed, note_paths) !== undefined;
}
