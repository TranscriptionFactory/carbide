import type { CslDate, CslName, LinkedSourceMeta, ScanEntry } from "../types";
import { citekey_slug } from "./csl_utils";

export function generate_linked_source_id(): string {
  return crypto.randomUUID();
}

export function derive_title_from_filename(file_path: string): string {
  const name = file_path.split("/").pop() ?? file_path;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .trim();
}

export function parse_author_string(author: string): CslName[] {
  const raw = author.includes(";")
    ? author.split(";")
    : author.split(",").length > 2
      ? author.split(",")
      : [author];

  return raw
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a): CslName => {
      const parts = a.split(",").map((p) => p.trim());
      if (parts.length >= 2) {
        return { family: parts[0]!, given: parts[1]! };
      }
      const words = a.split(/\s+/);
      if (words.length >= 2) {
        return {
          family: words[words.length - 1]!,
          given: words.slice(0, -1).join(" "),
        };
      }
      return { literal: a };
    });
}

export function parse_creation_date(raw: string): CslDate | null {
  // PDF date format: D:YYYYMMDDHHmmSS...
  const pdf_match = raw.match(/D:(\d{4})(\d{2})?(\d{2})?/);
  if (pdf_match) {
    const parts: number[] = [parseInt(pdf_match[1]!, 10)];
    if (pdf_match[2]) parts.push(parseInt(pdf_match[2], 10));
    if (pdf_match[3]) parts.push(parseInt(pdf_match[3], 10));
    return { "date-parts": [parts] };
  }

  // ISO-ish: YYYY-MM-DD, YYYY/MM/DD, YYYY-MM, YYYY
  const iso_match = raw.match(/(\d{4})[\-/]?(\d{1,2})?[\-/]?(\d{1,2})?/);
  if (iso_match) {
    const year = parseInt(iso_match[1]!, 10);
    if (year < 1000 || year > 2100) return null;
    const parts: number[] = [year];
    if (iso_match[2]) parts.push(parseInt(iso_match[2], 10));
    if (iso_match[3]) parts.push(parseInt(iso_match[3], 10));
    return { "date-parts": [parts] };
  }

  return null;
}

export function scan_entry_to_linked_meta(
  entry: ScanEntry,
  source_id: string,
): LinkedSourceMeta {
  const family = entry.author ? first_author_family(entry.author) : "unknown";
  const year = entry.creation_date
    ? parse_year_from_date(entry.creation_date)
    : undefined;
  const hash = simple_hash(entry.file_path);
  const citekey = `${citekey_slug(family, year)}-${hash}`;

  const meta: LinkedSourceMeta = {
    citekey,
    item_type: entry.file_type === "html" ? "webpage" : "article",
    external_file_path: entry.file_path,
    linked_source_id: source_id,
  };
  if (entry.author) meta.authors = entry.author;
  if (year) meta.year = year;
  if (entry.doi) meta.doi = entry.doi;
  if (entry.isbn) meta.isbn = entry.isbn;
  if (entry.arxiv_id) meta.arxiv_id = entry.arxiv_id;
  if (entry.subject) meta.abstract = entry.subject;
  return meta;
}

function first_author_family(author_str: string): string {
  const first = author_str.includes(";")
    ? author_str.split(";")[0]!.trim()
    : author_str.split(",").length > 2
      ? author_str.split(",")[0]!.trim()
      : author_str.trim();
  if (!first) return "unknown";
  const comma_parts = first.split(",").map((p) => p.trim());
  if (comma_parts.length >= 2) return comma_parts[0]!;
  const words = first.split(/\s+/);
  return words.length >= 2 ? words[words.length - 1]! : first;
}

function parse_year_from_date(raw: string): number | undefined {
  const parsed = parse_creation_date(raw);
  return parsed?.["date-parts"]?.[0]?.[0];
}

function simple_hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}
