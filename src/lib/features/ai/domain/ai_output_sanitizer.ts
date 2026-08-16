// Model output reaches the document verbatim; a chatty completion otherwise
// lands in the note and in the accept diff. Both rules below are deliberately
// narrow — anything that does not match is returned untouched.

const MAX_PREAMBLE_LENGTH = 200;

// Announces what follows, so it is only a preamble when it actually introduces
// something: the trailing colon is required.
const ANNOUNCING_LEAD_IN =
  /^(here'?s|here is|here are|below is|below are|the following|this is|i've|i have)\b/i;

// Conversational filler. Stripping is asymmetric — leaving scaffolding behind
// costs the user a keystroke, deleting their sentence costs them the sentence,
// and source mode has no accept step to catch it. So a paragraph that is
// nothing but the opener goes; one that carries content past it needs the same
// colon an announcement does.
const OPENERS =
  "sure|certainly|absolutely|of course|got it|no problem|here you go";
const CONVERSATIONAL_OPENER = new RegExp(`^(${OPENERS})\\b`, "i");
const BARE_OPENER = new RegExp(`^(${OPENERS})[.!…]*$`, "i");

const MARKDOWN_STRUCTURE = /^(#|>|[-*+]\s|\d+[.)]\s|\||`{3,}|~{3,})/;

// The tail rule is stricter than the head rule, and deliberately so. The
// document path prompts for "the complete edited markdown for the document", so
// the trailing paragraph of a model reply is routinely the *user's* last
// paragraph, and the inline path applies the result with no accept step. A head
// false positive costs a preamble; a tail false positive costs the user a line
// they wrote.
const MAX_CLOSER_LENGTH = 160;

// Both halves are required. The offer frame alone is ordinary prose — "Let me
// know if you'd like to grab coffee!" — so it only reads as a closer when it
// offers to keep working on the text that precedes it. There is no tail
// equivalent of the head rule's colon, which is why the weaker announcing tier
// has no counterpart here.
const CLOSER_OFFER =
  /^(let me know|just let me know|feel free to|would you like|do you want|want me to|i can|i could|i'?d be happy to|happy to|i hope this helps|hope this helps)\b/i;

const REVISION_STEMS =
  "adjust|tweak|revis|rewrit|reword|edit|chang|expand|shorten|lengthen|refin|elaborat|clarif|polish|iterat|modif|amend|condens|restructur|reorder";
const CLOSER_SUBJECT = new RegExp(`\\b(?:${REVISION_STEMS})\\w*`, "i");

const WRAPPER_INFO_STRINGS = new Set([
  "",
  "markdown",
  "md",
  "text",
  "txt",
  "plaintext",
]);

export function sanitize_ai_output(raw: string): string {
  const cleaned = unwrap_wrapper_fence(
    strip_trailing_closers(strip_leading_preamble(raw)),
  );
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
  if (BARE_OPENER.test(paragraph)) return true;
  if (!paragraph.endsWith(":")) return false;
  return (
    ANNOUNCING_LEAD_IN.test(paragraph) || CONVERSATIONAL_OPENER.test(paragraph)
  );
}

// Requires the last paragraph to be a single line, which is what keeps a
// trailing table, list or fenced block out of reach: those are multi-line, so
// the split simply does not match and the text comes back untouched. Recurses
// so that stacked closers are idempotent rather than order-dependent.
function strip_trailing_closers(text: string): string {
  const split = /^([\s\S]*?)\n[ \t]*\n([^\n]*)$/.exec(text.trimEnd());
  if (!split) return text;
  const [, head = "", tail = ""] = split;
  if (head.trim() === "") return text;
  return is_closer(tail.trim()) ? strip_trailing_closers(head) : text;
}

function is_closer(paragraph: string): boolean {
  if (paragraph.length === 0 || paragraph.length > MAX_CLOSER_LENGTH) {
    return false;
  }
  if (MARKDOWN_STRUCTURE.test(paragraph)) return false;
  return CLOSER_OFFER.test(paragraph) && CLOSER_SUBJECT.test(paragraph);
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
