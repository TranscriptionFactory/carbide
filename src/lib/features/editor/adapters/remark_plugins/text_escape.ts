import type { Info, State } from "mdast-util-to-markdown";
import { classifyCharacter } from "micromark-util-classify-character";

const CHARACTER_GROUP_WHITESPACE = 1;
const CHARACTER_GROUP_PUNCTUATION = 2;

type FlankClass = "ws" | "punct" | "other";

export function safe_text(state: State, value: string, info: Info): string {
  const original_unsafe = state.unsafe;
  state.unsafe = original_unsafe.filter((u) => {
    if (u.character === "&" && u.after === "[#A-Za-z]") return false;
    if (u.character === "<") return false;
    if (u.character === "[") return false;
    if (u.character === "(") return false;
    if (u.character === "`") return false;
    if (
      (u.character === "*" || u.character === "_" || u.character === "~") &&
      u.inConstruct === "phrasing"
    ) {
      return false;
    }
    if (u.character === "=" && u.atBreak === true) return false;
    if (
      (u.character === " " || u.character === "\t") &&
      u.inConstruct === "phrasing" &&
      u.after === "[\\r\\n]"
    ) {
      return false;
    }
    return true;
  });

  let result: string;
  try {
    result = state.safe(value, info);
  } finally {
    state.unsafe = original_unsafe;
  }

  return escape_entity_ampersands(escape_active_delimiter_runs(result, info));
}

function escape_entity_ampersands(s: string): string {
  return s.replace(
    /(?<!\\)&(?=(#[0-9]+|#[xX][0-9A-Fa-f]+|[A-Za-z][A-Za-z0-9]*);)/g,
    (match, body: string) =>
      is_whitespace_numeric_char_ref(body) ? match : `\\${match}`,
  );
}

function is_whitespace_numeric_char_ref(body: string): boolean {
  if (body.charCodeAt(0) !== 0x23 /* '#' */) return false;
  const code =
    body[1] === "x" || body[1] === "X"
      ? Number.parseInt(body.slice(2), 16)
      : Number.parseInt(body.slice(1), 10);
  return (
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0b ||
    code === 0x0c ||
    code === 0x0d ||
    code === 0x20
  );
}

function classify_flank(code: number): FlankClass {
  if (Number.isNaN(code)) return "ws";
  const group = classifyCharacter(code);
  if (group === CHARACTER_GROUP_WHITESPACE) return "ws";
  if (group === CHARACTER_GROUP_PUNCTUATION) return "punct";
  return "other";
}

function is_active_delimiter_run(
  marker: "*" | "_" | "~",
  before_code: number,
  after_code: number,
): boolean {
  const before = classify_flank(before_code);
  const after = classify_flank(after_code);
  const left_flanking =
    after !== "ws" && (after === "other" || before !== "other");
  const right_flanking =
    before !== "ws" && (before === "other" || after !== "other");
  if (marker === "_") {
    const can_open = left_flanking && (!right_flanking || before === "punct");
    const can_close = right_flanking && (!left_flanking || after === "punct");
    return can_open || can_close;
  }
  return left_flanking || right_flanking;
}

function is_setext_underline_shape(
  value: string,
  run_end: number,
  info: Info,
): boolean {
  let k = run_end;
  while (k < value.length && (value[k] === " " || value[k] === "\t")) k++;
  if (k < value.length) return value[k] === "\n" || value[k] === "\r";
  const next = info.after.charCodeAt(0);
  return Number.isNaN(next) || next === 0x0a || next === 0x0d;
}

function escape_active_delimiter_runs(value: string, info: Info): string {
  let result = "";
  let i = 0;
  while (i < value.length) {
    const ch = value.charAt(i);
    if (ch === "\\") {
      result += value.slice(i, i + 2);
      i += 2;
      continue;
    }
    if (ch === "*" || ch === "_" || ch === "~" || ch === "=") {
      let j = i + 1;
      while (j < value.length && value.charAt(j) === ch) j++;
      const before_code =
        i === 0
          ? info.before.charCodeAt(info.before.length - 1)
          : value.charCodeAt(i - 1);
      if (ch === "=") {
        const at_line_start =
          Number.isNaN(before_code) ||
          before_code === 0x0a ||
          before_code === 0x0d;
        result +=
          at_line_start && is_setext_underline_shape(value, j, info)
            ? `\\${value.slice(i, j)}`
            : value.slice(i, j);
      } else {
        const after_code =
          j < value.length ? value.charCodeAt(j) : info.after.charCodeAt(0);
        result += is_active_delimiter_run(ch, before_code, after_code)
          ? `\\${ch}`.repeat(j - i)
          : value.slice(i, j);
      }
      i = j;
      continue;
    }
    result += ch;
    i += 1;
  }
  return result;
}
