// Model output reaches the document verbatim; a chatty completion otherwise
// lands in the note and in the accept diff. Both rules below are deliberately
// narrow — anything that does not match is returned untouched.

const MAX_PREAMBLE_LENGTH = 200;

// Announces what follows, so it is only a preamble when it actually introduces
// something: the trailing colon is required.
const ANNOUNCING_LEAD_IN =
  /^(here'?s|here is|here are|below is|below are|the following|this is|i've|i have)\b/i;

// Conversational filler that never introduces content on its own.
const CONVERSATIONAL_OPENER =
  /^(sure|certainly|absolutely|of course|got it|no problem|here you go)\b/i;

const MARKDOWN_STRUCTURE = /^(#|>|[-*+]\s|\d+[.)]\s|\||`{3,}|~{3,})/;

const WRAPPER_INFO_STRINGS = new Set([
  "",
  "markdown",
  "md",
  "text",
  "txt",
  "plaintext",
]);

export function sanitize_ai_output(raw: string): string {
  const cleaned = unwrap_wrapper_fence(strip_leading_preamble(raw));
  return cleaned.trim() === "" ? raw : cleaned;
}

function strip_leading_preamble(text: string): string {
  const split = /^([\s\S]*?)\n[ \t]*\n([\s\S]*)$/.exec(text);
  if (!split) return text;
  const [, head = "", rest = ""] = split;
  if (rest.trim() === "") return text;
  return is_preamble(head.trim()) ? rest : text;
}

function is_preamble(paragraph: string): boolean {
  if (paragraph.length === 0 || paragraph.length > MAX_PREAMBLE_LENGTH) {
    return false;
  }
  if (MARKDOWN_STRUCTURE.test(paragraph)) return false;
  if (CONVERSATIONAL_OPENER.test(paragraph)) return true;
  return paragraph.endsWith(":") && ANNOUNCING_LEAD_IN.test(paragraph);
}

// Only unwraps when the entire output is one fence carrying a markdown-ish info
// string, so a fenced code block that *is* the answer survives.
function unwrap_wrapper_fence(text: string): string {
  const lines = text.trim().split("\n");
  const opener = /^(`{3,}|~{3,})[ \t]*(\S*)[ \t]*$/.exec(lines[0] ?? "");
  if (!opener) return text;

  const [, fence = "", info = ""] = opener;
  if (!WRAPPER_INFO_STRINGS.has(info.toLowerCase())) return text;

  const closer = new RegExp(`^${fence[0] ?? ""}{${fence.length},}[ \\t]*$`);
  const close_at = lines.findIndex((line, i) => i > 0 && closer.test(line));
  if (close_at !== lines.length - 1) return text;

  return lines.slice(1, close_at).join("\n");
}
