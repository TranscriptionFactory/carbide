export function leaf_of_section(section: string | undefined | null): string {
  if (!section) return "";
  const idx = section.lastIndexOf("/");
  return idx === -1 ? section : section.slice(idx + 1);
}

export function full_section_path(section: string | undefined | null): string {
  return section ?? "";
}
