export type CslName = {
  family?: string;
  given?: string;
  literal?: string;
};

export type CslDate = {
  "date-parts"?: number[][];
  literal?: string;
};

export type CslItem = {
  id: string;
  type: string;
  title?: string;
  author?: CslName[];
  issued?: CslDate;
  DOI?: string;
  URL?: string;
  abstract?: string;
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  publisher?: string;
  [key: string]: unknown;
};

export type ReferenceLibrary = {
  schema_version: number;
  items: CslItem[];
};

export type ReferenceSource =
  | "citationjs"
  | "manual"
  | "translation_server"
  | "linked_source"
  | "extension";

export type LinkedSource = {
  id: string;
  path: string;
  name: string;
  enabled: boolean;
  last_scan_at: number | null;
};

export type ScanEntry = {
  file_path: string;
  file_name: string;
  file_type: string;
  title: string | null;
  author: string | null;
  subject: string | null;
  keywords: string | null;
  doi: string | null;
  isbn: string | null;
  arxiv_id: string | null;
  creation_date: string | null;
  body_text: string;
  page_offsets: number[];
  modified_at: number;
};

export type LinkedSourceMeta = {
  citekey?: string;
  authors?: string;
  year?: number;
  doi?: string;
  isbn?: string;
  arxiv_id?: string;
  journal?: string;
  abstract?: string;
  item_type?: string;
  external_file_path?: string;
  linked_source_id?: string;
};

export type LinkedNoteInfo = {
  path: string;
  title: string;
  mtime_ms: number;
  citekey?: string;
  authors?: string;
  year?: number;
  doi?: string;
  item_type?: string;
  external_file_path?: string;
  linked_source_id?: string;
};

export type PdfAnnotation = {
  citekey: string;
  page: number;
  text: string;
  comment?: string;
  color?: string;
  type: "highlight" | "note" | "underline";
};
