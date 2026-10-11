export const CALLOUT_TYPES = [
  "note",
  "abstract",
  "summary",
  "tldr",
  "info",
  "todo",
  "tip",
  "hint",
  "important",
  "success",
  "check",
  "done",
  "question",
  "help",
  "faq",
  "warning",
  "caution",
  "attention",
  "failure",
  "fail",
  "missing",
  "danger",
  "error",
  "bug",
  "example",
  "quote",
  "cite",
] as const;

export type CalloutType = (typeof CALLOUT_TYPES)[number];

const CALLOUT_TYPE_SET = new Set<string>(CALLOUT_TYPES);

export const CALLOUT_DIRECTIVE_RE =
  /^\[!(?<type>[^\]|]+)(?:\|(?<color>[^\]]*))?\](?<fold>[+-])?(?:\s+(?<title>.*))?$/;

export const CALLOUT_COLORS = [
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
  "brown",
  "gray",
  "black",
  "white",
] as const;

const CALLOUT_COLOR_SET = new Set<string>([...CALLOUT_COLORS, "grey"]);
const HEX_COLOR_RE =
  /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export function sanitize_callout_color(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (HEX_COLOR_RE.test(trimmed)) return trimmed;
  const lower = trimmed.toLowerCase();
  if (CALLOUT_COLOR_SET.has(lower)) return lower;
  return null;
}

export type CalloutData = {
  callout_type: CalloutType;
  title: string;
  color: string | null;
  foldable: boolean;
  default_folded: boolean;
};

const CANONICAL_TYPE: Record<string, CalloutType> = {
  summary: "abstract",
  tldr: "abstract",
  hint: "tip",
  check: "success",
  done: "success",
  help: "question",
  faq: "question",
  caution: "warning",
  attention: "warning",
  fail: "failure",
  missing: "failure",
  error: "danger",
  cite: "quote",
};

export function normalize_callout_type(raw: string): CalloutType {
  const lower = raw.trim().toLowerCase();
  if (CALLOUT_TYPE_SET.has(lower)) return lower as CalloutType;
  return "note";
}

export function canonical_callout_type(raw: string): CalloutType {
  const normalized = normalize_callout_type(raw);
  return CANONICAL_TYPE[normalized] ?? normalized;
}

export function default_callout_title(callout_type: string): string {
  if (!callout_type) return callout_type;
  return (
    callout_type.charAt(0).toUpperCase() + callout_type.slice(1).toLowerCase()
  );
}

export function parse_callout_directive(text: string): CalloutData | null {
  const match = CALLOUT_DIRECTIVE_RE.exec(text.trim());
  if (!match?.groups) return null;

  const raw_type = match.groups["type"] ?? "";
  const fold = match.groups["fold"];
  const explicit_title = match.groups["title"]?.trim();

  const callout_type = normalize_callout_type(raw_type);

  return {
    callout_type,
    title: explicit_title || default_callout_title(raw_type),
    color: sanitize_callout_color(match.groups["color"]),
    foldable: fold === "+" || fold === "-",
    default_folded: fold === "-",
  };
}

export function format_callout_directive(data: CalloutData): string {
  const fold_marker = data.foldable ? (data.default_folded ? "-" : "+") : "";
  const default_title = default_callout_title(data.callout_type);
  const title_part =
    data.title && data.title !== default_title ? ` ${data.title}` : "";
  const color_part = data.color ? `|${data.color}` : "";
  return `[!${data.callout_type}${color_part}]${fold_marker}${title_part}`;
}

export const CALLOUT_ICONS: Record<string, string> = {
  note: "pencil",
  abstract: "clipboard-list",
  info: "info",
  todo: "circle-check",
  tip: "flame",
  success: "check",
  question: "circle-help",
  warning: "triangle-alert",
  failure: "x",
  danger: "zap",
  bug: "bug",
  example: "list",
  quote: "quote",
  important: "message-circle-warning",
};

export function callout_icon_svg(name: string): string {
  const icons: Record<string, string> = {
    pencil: `<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>`,
    "clipboard-list": `<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>`,
    info: `<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>`,
    "circle-check": `<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>`,
    flame: `<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>`,
    check: `<path d="M20 6 9 17l-5-5"/>`,
    "circle-help": `<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>`,
    "triangle-alert": `<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>`,
    x: `<path d="M18 6 6 18"/><path d="m6 6 12 12"/>`,
    zap: `<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>`,
    bug: `<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>`,
    list: `<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>`,
    quote: `<path d="M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/><path d="M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z"/>`,
    "message-circle-warning": `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/><path d="M12 8v4"/><path d="M12 16h.01"/>`,
  };
  const paths = icons[name] ?? icons["pencil"] ?? "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function callout_icon_for_type(callout_type: string): string {
  const canonical = canonical_callout_type(callout_type);
  return CALLOUT_ICONS[canonical] ?? "pencil";
}
