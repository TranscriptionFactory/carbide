const MARKDOWN_EXTENSIONS = new Set([".md", ".markdown"]);

export function is_markdown_filename(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  return MARKDOWN_EXTENSIONS.has(name.slice(dot).toLowerCase());
}

export function classify_external_files<T extends { name: string }>(
  files: T[],
): { markdown_files: T[]; asset_files: T[] } {
  const markdown_files: T[] = [];
  const asset_files: T[] = [];
  for (const file of files) {
    if (is_markdown_filename(file.name)) {
      markdown_files.push(file);
    } else {
      asset_files.push(file);
    }
  }
  return { markdown_files, asset_files };
}

export function resolve_external_drop_folder(
  node: { is_folder: boolean; path: string } | null,
): string {
  return node?.is_folder ? node.path : "";
}

export function uniquify_note_path(
  target_folder: string,
  filename: string,
  existing_paths: Iterable<string>,
): string {
  const taken = new Set<string>();
  for (const path of existing_paths) {
    taken.add(path.toLowerCase());
  }

  const build = (name: string) =>
    target_folder ? `${target_folder}/${name}` : name;

  if (!taken.has(build(filename).toLowerCase())) {
    return build(filename);
  }

  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  let counter = 2;
  for (;;) {
    const candidate = build(`${stem}-${String(counter)}${ext}`);
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
    counter += 1;
  }
}
