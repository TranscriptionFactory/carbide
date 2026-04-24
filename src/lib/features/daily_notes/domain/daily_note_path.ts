import { format_note_name } from "$lib/features/note";

export function daily_note_path(
  folder: string,
  name_format: string,
  date: Date,
): string {
  const year = String(date.getFullYear());
  const name = format_note_name(name_format, date);
  return `${folder}/${year}/${name}.md`;
}

const STRFTIME_TOKEN_REGEX: Record<string, string> = {
  "%Y": "(?<Y>\\d{4})",
  "%m": "(?<m>\\d{2})",
  "%d": "(?<d>\\d{2})",
  "%H": "(?<H>\\d{2})",
  "%M": "(?<M>\\d{2})",
  "%S": "(?<S>\\d{2})",
};

function build_parse_regex(
  folder: string,
  name_format: string,
): RegExp | null {
  let pattern = name_format;
  for (const [token, group] of Object.entries(STRFTIME_TOKEN_REGEX)) {
    pattern = pattern.replaceAll(token, group);
  }
  const escaped_folder = folder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const full = `^${escaped_folder}/\\d{4}/${pattern}\\.md$`;
  try {
    return new RegExp(full);
  } catch {
    return null;
  }
}

export function parse_daily_note_date(
  folder: string,
  name_format: string,
  note_path: string,
): Date | null {
  const regex = build_parse_regex(folder, name_format);
  if (!regex) return null;

  const match = regex.exec(note_path);
  if (!match?.groups) return null;

  const year = Number(match.groups["Y"]);
  const month = Number(match.groups["m"]);
  const day = Number(match.groups["d"]);

  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}
