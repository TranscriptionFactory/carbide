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
