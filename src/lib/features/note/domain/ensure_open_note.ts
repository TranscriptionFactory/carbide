import type { OpenNoteState } from "$lib/shared/types/editor";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import { format_note_name } from "$lib/features/note/domain/format_note_name";

const DRAFT_PREFIX = "draft:";
const UNTITLED_PATTERN = /^Untitled(?:-(\d+))?$/;

function next_untitled_title(open_titles: string[]): string {
  let max = 0;

  for (const title of open_titles) {
    const match = title.match(UNTITLED_PATTERN);
    if (!match) continue;
    const value = match[1] ? Number(match[1]) : 1;
    if (value > max) max = value;
  }

  if (max <= 0) {
    return "Untitled-1";
  }

  return `Untitled-${String(max + 1)}`;
}

function create_draft_path(now_ms: number, title: string) {
  return as_note_path(`${DRAFT_PREFIX}${String(now_ms)}:${title}`);
}

export function is_draft_note_path(path: string): boolean {
  return path.startsWith(DRAFT_PREFIX);
}

function next_template_title(base: string, open_titles: string[]): string {
  const titles_set = new Set(open_titles);
  if (!titles_set.has(base)) {
    return base;
  }
  let n = 2;
  while (titles_set.has(`${base}-${String(n)}`)) {
    n += 1;
  }
  return `${base}-${String(n)}`;
}

function format_date_iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

function build_initial_frontmatter(title: string, now_ms: number): string {
  const date = format_date_iso(now_ms);
  return `---\ntitle: "${title}"\ndate_created: ${date}\n---\n\n`;
}

export function create_untitled_open_note(args: {
  open_titles: string[];
  now_ms: number;
  template?: string;
}): OpenNoteState {
  const formatted = args.template
    ? format_note_name(args.template, new Date(args.now_ms))
    : "";
  const title = formatted
    ? next_template_title(formatted, args.open_titles)
    : next_untitled_title(args.open_titles);
  const draft_path = create_draft_path(args.now_ms, title);
  const frontmatter = build_initial_frontmatter(title, args.now_ms);

  return {
    meta: {
      id: draft_path,
      path: draft_path,
      name: title,
      title,
      blurb: "",
      mtime_ms: args.now_ms,
      ctime_ms: args.now_ms,
      size_bytes: 0,
      file_type: null,
    },
    markdown: as_markdown_text(frontmatter),
    buffer_id: `untitled:${String(args.now_ms)}:${title}`,
    is_dirty: true,
  };
}
