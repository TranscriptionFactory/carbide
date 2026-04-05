const NEEDS_QUOTE_RE = /[:#{}\[\]>|*&!%@`,"]|^(true|false|yes|no|null|~)$/i;
const FRONTMATTER_RE = /^---[ \t]*\n([\s\S]*?)---[ \t]*(?:\n|$)/;

function find_frontmatter(markdown: string): {
  start: number;
  end: number;
  body: string;
} | null {
  const match = FRONTMATTER_RE.exec(markdown);
  if (!match || match[1] === undefined) return null;
  const raw_body: string = match[1];
  const body = raw_body.endsWith("\n") ? raw_body.slice(0, -1) : raw_body;
  return {
    start: match.index,
    end: match.index + match[0].length,
    body,
  };
}

function format_yaml_value(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number") return String(value);

  if (typeof value === "string") {
    if (value === "") return '""';
    if (NEEDS_QUOTE_RE.test(value))
      return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const items = value.map((v) => format_yaml_value(v));
    if (value.length <= 3 && items.every((s) => !s.includes("\n"))) {
      return `[${items.join(", ")}]`;
    }
    return "\n" + items.map((item) => `  - ${item}`).join("\n");
  }

  if (typeof value === "object" && value !== null) {
    return JSON.stringify(value);
  }

  return String(value);
}

function find_key_line(
  body: string,
  key: string,
): { lineStart: number; lineEnd: number; indent: string } | null {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^([ \t]*)${escaped}[ \t]*:.*$`, "m");
  const match = re.exec(body);
  if (!match || match[1] === undefined) return null;

  let lineEnd = match.index + match[0].length;

  const rest = body.slice(lineEnd);
  const lines = rest.split("\n");
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^[ \t]+-[ \t]+/.test(line)) {
      lineEnd += 1 + line.length;
    } else {
      break;
    }
  }

  return { lineStart: match.index, lineEnd, indent: match[1] };
}

function rebuild(
  markdown: string,
  fm: { start: number; end: number },
  new_body: string,
): string {
  const after = markdown.slice(fm.end);
  if (new_body === "") {
    return markdown.slice(0, fm.start) + "---\n---\n" + after;
  }
  return markdown.slice(0, fm.start) + "---\n" + new_body + "\n---\n" + after;
}

export function ensure_frontmatter(markdown: string): string {
  if (find_frontmatter(markdown)) return markdown;
  return "---\n---\n" + markdown;
}

export function update_frontmatter_property(
  markdown: string,
  key: string,
  value: unknown,
): string {
  const fm = find_frontmatter(markdown);
  if (!fm) {
    return add_frontmatter_property(ensure_frontmatter(markdown), key, value);
  }

  const found = find_key_line(fm.body, key);
  if (!found) {
    return add_frontmatter_property(markdown, key, value);
  }

  const formatted = format_yaml_value(value);
  const replacement = `${found.indent}${key}: ${formatted}`;
  const new_body =
    fm.body.slice(0, found.lineStart) +
    replacement +
    fm.body.slice(found.lineEnd);

  return rebuild(markdown, fm, new_body);
}

export function add_frontmatter_property(
  markdown: string,
  key: string,
  value: unknown,
): string {
  const fm = find_frontmatter(markdown);
  if (!fm) {
    const ensured = ensure_frontmatter(markdown);
    return add_frontmatter_property(ensured, key, value);
  }

  const found = find_key_line(fm.body, key);
  if (found) {
    return update_frontmatter_property(markdown, key, value);
  }

  const formatted = format_yaml_value(value);
  const new_line = `${key}: ${formatted}`;
  const new_body = fm.body.trim() === "" ? new_line : fm.body + "\n" + new_line;

  return rebuild(markdown, fm, new_body);
}

export function remove_frontmatter_property(
  markdown: string,
  key: string,
): string {
  const fm = find_frontmatter(markdown);
  if (!fm) return markdown;

  const found = find_key_line(fm.body, key);
  if (!found) return markdown;

  let before = fm.body.slice(0, found.lineStart);
  let after = fm.body.slice(found.lineEnd);

  if (before.endsWith("\n") && (after.startsWith("\n") || after === "")) {
    before = before.slice(0, -1);
  } else if (after.startsWith("\n")) {
    after = after.slice(1);
  }

  const new_body = (before + after).replace(/^\n+/, "").replace(/\n+$/, "");

  return rebuild(markdown, fm, new_body);
}
