export type PropertyType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "array"
  | "tags";

export type NoteProperty = {
  key: string;
  value: string;
  type: PropertyType;
};

export type NoteTag = {
  tag: string;
  source: "frontmatter" | "inline";
};

export type NoteMetadata = {
  properties: NoteProperty[];
  tags: NoteTag[];
};

export type VaultProperty = {
  name: string;
  property_type: string;
  count: number;
  unique_values: string[] | null;
};

export type StandardField = {
  key: string;
  type: PropertyType;
  description: string;
  values?: string[];
  keywords?: string[];
};

export type KeySuggestion = {
  key: string;
  type: PropertyType;
  description: string | null;
  source: "standard" | "vault";
  count: number | null;
  indices: number[];
};

export type ValueSuggestion = {
  value: string;
  indices: number[];
};

export type CachedHeading = {
  level: number;
  text: string;
  line: number;
};

export type CachedLink = {
  target_path: string;
  link_text: string;
  link_type: string;
  section_heading: string | null;
  target_anchor: string | null;
};

export type FileCache = {
  frontmatter: Record<string, [string, string]>;
  tags: string[];
  headings: CachedHeading[];
  links: CachedLink[];
  embeds: CachedLink[];
  stats: import("$lib/features/search").NoteStats;
  ctime_ms: number;
  mtime_ms: number;
  size_bytes: number;
};
