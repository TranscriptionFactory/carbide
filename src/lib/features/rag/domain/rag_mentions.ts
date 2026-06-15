const MENTION_RE = /@([A-Za-z0-9/_.-]+)/g;

export type ParsedMentions = {
  mentions: string[];
  cleaned_question: string;
};

export function parse_mentions(question: string): ParsedMentions {
  const mentions: string[] = [];
  const cleaned_question = question.replace(
    MENTION_RE,
    (_match, name: string) => {
      if (!mentions.includes(name)) mentions.push(name);
      return name;
    },
  );
  return { mentions, cleaned_question };
}
