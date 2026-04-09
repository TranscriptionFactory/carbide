const OPENING_FENCE = /^---[ \t]*\n/;
const CLOSING_FENCE_INLINE = /\n---[ \t]*(?:\n|$)/;
const CLOSING_FENCE_START = /^---[ \t]*(?:\n|$)/;

export type ParsedFrontmatter = {
  yaml: string;
  body: string;
  has_frontmatter: boolean;
};

export type FrontmatterSpan = {
  yaml: string;
  start: number;
  end: number;
};

function find_closing_fence(
  rest: string,
): { yaml_length: number; fence_end: number } | null {
  const start_match = CLOSING_FENCE_START.exec(rest);
  if (start_match) {
    return { yaml_length: 0, fence_end: start_match[0].length };
  }

  const inline_match = CLOSING_FENCE_INLINE.exec(rest);
  if (inline_match) {
    return {
      yaml_length: inline_match.index,
      fence_end: inline_match.index + inline_match[0].length,
    };
  }

  return null;
}

export function parse_frontmatter(markdown: string): ParsedFrontmatter {
  const no_fm: ParsedFrontmatter = {
    yaml: "",
    body: markdown,
    has_frontmatter: false,
  };

  if (!OPENING_FENCE.test(markdown)) return no_fm;

  const opening_end = markdown.indexOf("\n") + 1;
  const rest = markdown.slice(opening_end);
  const closing = find_closing_fence(rest);
  if (!closing) return no_fm;

  const yaml = rest.slice(0, closing.yaml_length);
  const body = rest.slice(closing.fence_end);

  return { yaml, body, has_frontmatter: true };
}

export function find_frontmatter_span(
  markdown: string,
): FrontmatterSpan | null {
  if (!OPENING_FENCE.test(markdown)) return null;

  const opening_end = markdown.indexOf("\n") + 1;
  const rest = markdown.slice(opening_end);
  const closing = find_closing_fence(rest);
  if (!closing) return null;

  const yaml = rest.slice(0, closing.yaml_length);
  return { yaml, start: 0, end: opening_end + closing.fence_end };
}

export function rebuild_frontmatter(yaml: string, body: string): string {
  if (!yaml.trim()) return body;
  return `---\n${yaml}\n---\n${body}`;
}
