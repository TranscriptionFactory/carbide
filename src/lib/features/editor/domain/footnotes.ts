const DEFINITION_RE = /^\[\^([^\]\s]+)\]:[ \t]?/;
const CONTINUATION_INDENT_RE = /^ {1,4}/;

export type FootnoteDefinition = { label: string; body: string };

export function normalize_footnote_label(label: string): string {
  return label.toLowerCase();
}

export function format_footnote_ref(label: string): string {
  return `[^${label}]`;
}

export function parse_footnote_definition(
  source: string,
): FootnoteDefinition | null {
  const match = DEFINITION_RE.exec(source);
  if (!match?.[1]) return null;
  const [first = "", ...rest] = source.slice(match[0].length).split("\n");
  const body = [
    first,
    ...rest.map((line) => line.replace(CONTINUATION_INDENT_RE, "")),
  ].join("\n");
  return { label: match[1], body: body.trim() };
}

export function number_footnotes(
  ref_labels: readonly string[],
  defined_labels: ReadonlySet<string>,
): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const label of ref_labels) {
    const key = normalize_footnote_label(label);
    if (!defined_labels.has(key) || numbers.has(key)) continue;
    numbers.set(key, numbers.size + 1);
  }
  return numbers;
}
