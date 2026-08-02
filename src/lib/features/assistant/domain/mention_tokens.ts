const MENTION_RE = /@\[([^\]\n]+)\]|@([A-Za-z0-9/_.-]+)/g;
const BARE_MENTION_RE = /^[A-Za-z0-9/_.-]+$/;

export type ParsedMentions = {
  mentions: string[];
  cleaned_question: string;
};

export function parse_mentions(question: string): ParsedMentions {
  const mentions: string[] = [];
  const cleaned_question = question.replace(
    MENTION_RE,
    (_match, delimited: string | undefined, bare: string | undefined) => {
      const name = (delimited ?? bare ?? "").trim();
      if (name !== "" && !mentions.includes(name)) mentions.push(name);
      return name;
    },
  );
  return { mentions, cleaned_question };
}

export function format_mention_token(target: string): string {
  return BARE_MENTION_RE.test(target) ? `@${target}` : `@[${target}]`;
}

export function strip_mention(question: string, mention: string): string {
  return question
    .replace(
      MENTION_RE,
      (match, delimited: string | undefined, bare: string | undefined) =>
        (delimited ?? bare ?? "").trim() === mention ? "" : match,
    )
    .replace(/ {2,}/g, " ")
    .trim();
}
