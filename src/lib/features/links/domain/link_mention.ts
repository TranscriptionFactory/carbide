function escape_regex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function link_mentions(
  markdown: string,
  title: string,
): { markdown: string; changed: boolean } {
  const trimmed = title.trim();
  if (!trimmed) return { markdown, changed: false };

  const pattern = new RegExp(
    `(?<![\\w[])${escape_regex(trimmed)}(?![\\w\\]])`,
    "gi",
  );

  const lines = markdown.split("\n");
  let in_fence = false;
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*(```|~~~)/.test(line)) {
      in_fence = !in_fence;
      continue;
    }
    if (in_fence) continue;
    const replaced = line.replace(pattern, `[[${trimmed}]]`);
    if (replaced !== line) {
      lines[i] = replaced;
      changed = true;
    }
  }

  return changed
    ? { markdown: lines.join("\n"), changed: true }
    : { markdown, changed: false };
}
