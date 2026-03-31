import type { CslDate, CslItem, CslName, ScanEntry } from "../types";
import { generate_citekey } from "./csl_utils";

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

export function scan_entry_to_csl_item(
  entry: ScanEntry,
  source_id: string,
): CslItem {
  const title = entry.title ?? derive_title_from_filename(entry.file_path);

  const item: CslItem = {
    id: "",
    type: entry.file_type === "html" ? "webpage" : "article",
    title,
    _linked_source_id: source_id,
    _linked_file_path: entry.file_path,
    _linked_file_modified_at: entry.modified_at,
    _source: "linked_source" as const,
  };

  if (entry.author) {
    item.author = parse_author_string(entry.author);
  }
  if (entry.doi) {
    item.DOI = entry.doi;
  }
  if (entry.isbn) {
    item.ISBN = entry.isbn;
  }
  if (entry.arxiv_id) {
    item._arxiv_id = entry.arxiv_id;
  }

  if (entry.keywords) {
    item.keyword = entry.keywords;
  }
  if (entry.subject) {
    item.abstract = entry.subject;
  }

  if (entry.creation_date) {
    const issued = parse_creation_date(entry.creation_date);
    if (issued) {
      item.issued = issued;
    }
  }

  item.id = generate_citekey(item);

  // Ensure uniqueness by appending a hash suffix from file path
  const hash = simple_hash(entry.file_path);
  item.id = `${item.id}-${hash}`;

  return item;
}

function simple_hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36).slice(0, 6);
}
