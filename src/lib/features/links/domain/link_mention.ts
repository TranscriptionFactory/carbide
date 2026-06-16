function escape_regex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function link_first_mention(
  markdown: string,
  title: string,
): { markdown: string; changed: boolean } {
  const trimmed = title.trim();
  if (!trimmed) return { markdown, changed: false };

  const pattern = new RegExp(
    `(?<![\\w[])${escape_regex(trimmed)}(?![\\w\\]])`,
    "i",
  );

  const lines = markdown.split("\n");
  let in_fence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (/^\s*(```|~~~)/.test(line)) {
      in_fence = !in_fence;
      continue;
    }
    if (in_fence) continue;
    if (pattern.test(line)) {
      lines[i] = line.replace(pattern, `[[${trimmed}]]`);
      return { markdown: lines.join("\n"), changed: true };
    }
  }

  return { markdown, changed: false };
}
