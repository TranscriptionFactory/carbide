export type DateRange = { start_ms: number; end_ms: number };

export type QueryAnalysis = {
  topic: string;
  date_range: DateRange | null;
};

const DAY_MS = 86_400_000;
const RECENTLY_DAYS = 14;

function start_of_day(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function start_of_week(now: number): number {
  const d = new Date(start_of_day(now));
  const iso_day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - iso_day);
  return d.getTime();
}

function start_of_month(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function start_of_year(now: number): number {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setMonth(0, 1);
  return d.getTime();
}

type DateRule = {
  re: RegExp;
  range: (now: number, match: RegExpMatchArray) => DateRange;
};

const DATE_RULES: DateRule[] = [
  {
    re: /\b(?:in |over |during |within )?(?:the )?(?:last|past|previous) (\d+) days?\b/i,
    range: (now, m) => ({ start_ms: now - Number(m[1]) * DAY_MS, end_ms: now }),
  },
  {
    re: /\b(?:in |over |during |within )?(?:the )?(?:last|past|previous) (\d+) weeks?\b/i,
    range: (now, m) => ({
      start_ms: now - Number(m[1]) * 7 * DAY_MS,
      end_ms: now,
    }),
  },
  {
    re: /\b(?:in |over |during |within )?(?:the )?(?:last|past|previous) (\d+) months?\b/i,
    range: (now, m) => ({
      start_ms: now - Number(m[1]) * 30 * DAY_MS,
      end_ms: now,
    }),
  },
  {
    re: /\b(?:in |over |during )?(?:the )?(?:last|past|previous) week\b/i,
    range: (now) => ({
      start_ms: start_of_week(now) - 7 * DAY_MS,
      end_ms: start_of_week(now),
    }),
  },
  {
    re: /\bthis week\b/i,
    range: (now) => ({ start_ms: start_of_week(now), end_ms: now }),
  },
  {
    re: /\byesterday\b/i,
    range: (now) => ({
      start_ms: start_of_day(now) - DAY_MS,
      end_ms: start_of_day(now),
    }),
  },
  {
    re: /\btoday\b/i,
    range: (now) => ({ start_ms: start_of_day(now), end_ms: now }),
  },
  {
    re: /\b(?:the )?(?:last|past|previous) month\b/i,
    range: (now) => ({
      start_ms: start_of_month(start_of_month(now) - DAY_MS),
      end_ms: start_of_month(now),
    }),
  },
  {
    re: /\bthis month\b/i,
    range: (now) => ({ start_ms: start_of_month(now), end_ms: now }),
  },
  {
    re: /\b(?:the )?(?:last|past|previous) year\b/i,
    range: (now) => ({
      start_ms: start_of_year(start_of_year(now) - DAY_MS),
      end_ms: start_of_year(now),
    }),
  },
  {
    re: /\bthis year\b/i,
    range: (now) => ({ start_ms: start_of_year(now), end_ms: now }),
  },
  {
    re: /\b(?:recently|lately)\b/i,
    range: (now) => ({ start_ms: now - RECENTLY_DAYS * DAY_MS, end_ms: now }),
  },
];

const LEADING_PHRASES = [
  "what notes do i have about",
  "what do my notes say about",
  "what have i written about",
  "what did i write about",
  "the notes i wrote about",
  "summarize my notes about",
  "summarize my notes on",
  "show me the notes about",
  "find my notes about",
  "show me notes about",
  "what have i written",
  "summarize my notes",
  "find notes about",
  "what did i write",
  "notes i wrote about",
  "remind me about",
  "tell me about",
  "my notes about",
  "search for",
  "notes about",
  "summarize",
  "show me",
  "look up",
  "my notes on",
  "give me",
  "notes on",
  "remind me",
  "tell me",
  "find",
];

const EDGE_STOPWORDS = new Set([
  "about",
  "on",
  "of",
  "regarding",
  "the",
  "my",
  "a",
  "an",
  "i",
  "notes",
  "note",
  "wrote",
  "written",
  "made",
  "created",
  "that",
  "those",
  "these",
  "please",
]);

function strip_leading_phrases(text: string): string {
  let current = text.trim();
  let changed = true;
  while (changed) {
    changed = false;
    const lower = current.toLowerCase();
    for (const phrase of LEADING_PHRASES) {
      if (lower.startsWith(phrase)) {
        const rest = current.slice(phrase.length);
        if (rest === "" || /^\s/.test(rest)) {
          current = rest.trim();
          changed = true;
          break;
        }
      }
    }
  }
  return current;
}

function strip_edge_stopwords(text: string): string {
  const tokens = text.split(/\s+/).filter((t) => t !== "");
  let start = 0;
  let end = tokens.length;
  while (start < end && EDGE_STOPWORDS.has(tokens[start].toLowerCase())) start++;
  while (end > start && EDGE_STOPWORDS.has(tokens[end - 1].toLowerCase())) end--;
  return tokens.slice(start, end).join(" ");
}

function extract_date_range(
  question: string,
  now: number,
): { date_range: DateRange | null; without_date: string } {
  for (const rule of DATE_RULES) {
    const match = question.match(rule.re);
    if (match) {
      const without_date = question.replace(rule.re, " ");
      return { date_range: rule.range(now, match), without_date };
    }
  }
  return { date_range: null, without_date: question };
}

export function analyze_query(question: string, now: number): QueryAnalysis {
  const trimmed = question.trim();
  if (trimmed === "") return { topic: "", date_range: null };

  const { date_range, without_date } = extract_date_range(trimmed, now);

  const stripped = strip_edge_stopwords(strip_leading_phrases(without_date));
  const topic = stripped === "" ? "" : stripped;

  return { topic, date_range };
}
