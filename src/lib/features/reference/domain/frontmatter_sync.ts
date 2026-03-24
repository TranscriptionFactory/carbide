import YAML from "yaml";
import type { CslItem } from "../types";
import { format_authors, extract_year } from "./csl_utils";

export type FrontmatterReference = {
  citekey: string;
  title?: string;
  authors?: string;
  year?: number;
  doi?: string;
  journal?: string;
};

function csl_to_frontmatter_ref(item: CslItem): FrontmatterReference {
  const ref: FrontmatterReference = { citekey: item.id };
  if (item.title) ref.title = item.title;
  const authors = format_authors(item.author);
  if (authors) ref.authors = authors;
  const year = extract_year(item);
  if (year !== null) ref.year = year;
  if (item.DOI) ref.doi = item.DOI;
  const journal = item["container-title"];
  if (typeof journal === "string" && journal) ref.journal = journal;
  return ref;
}

export function sync_reference_to_frontmatter(
  yaml_str: string,
  item: CslItem,
): string {
  const doc = yaml_str.trim() ? (YAML.parse(yaml_str) ?? {}) : {};
  const refs: FrontmatterReference[] = Array.isArray(doc.references)
    ? doc.references
    : [];
  const entry = csl_to_frontmatter_ref(item);
  const idx = refs.findIndex((r) => r.citekey === item.id);
  if (idx >= 0) {
    refs[idx] = entry;
  } else {
    refs.push(entry);
  }
  doc.references = refs;
  return YAML.stringify(doc, { lineWidth: 0 }).trimEnd();
}

export function remove_reference_from_frontmatter(
  yaml_str: string,
  citekey: string,
): string {
  const doc = yaml_str.trim() ? (YAML.parse(yaml_str) ?? {}) : {};
  if (!Array.isArray(doc.references)) return yaml_str;
  doc.references = doc.references.filter(
    (r: FrontmatterReference) => r.citekey !== citekey,
  );
  if (doc.references.length === 0) delete doc.references;
  return YAML.stringify(doc, { lineWidth: 0 }).trimEnd();
}
