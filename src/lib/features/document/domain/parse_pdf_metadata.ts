import type { PdfMetadata } from "$lib/features/document/types/document";

export function parse_pdf_metadata(
  info: Record<string, unknown>,
  page_count: number,
): PdfMetadata {
  const metadata: PdfMetadata = { page_count };

  const title = string_or_undefined(info["Title"]);
  if (title !== undefined) metadata.title = title;

  const author = string_or_undefined(info["Author"]);
  if (author !== undefined) metadata.author = author;

  const subject = string_or_undefined(info["Subject"]);
  if (subject !== undefined) metadata.subject = subject;

  const keywords = string_or_undefined(info["Keywords"]);
  if (keywords !== undefined) metadata.keywords = keywords;

  const creator = string_or_undefined(info["Creator"]);
  if (creator !== undefined) metadata.creator = creator;

  const producer = string_or_undefined(info["Producer"]);
  if (producer !== undefined) metadata.producer = producer;

  const creation_date = string_or_undefined(info["CreationDate"]);
  if (creation_date !== undefined) metadata.creation_date = creation_date;

  const mod_date = string_or_undefined(info["ModDate"]);
  if (mod_date !== undefined) metadata.mod_date = mod_date;

  return metadata;
}

function string_or_undefined(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return undefined;
}
