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
  | "zotero_bbt"
  | "zotero_web"
  | "citationjs"
  | "manual"
  | "translation_server";

export type ZoteroCollection = {
  key: string;
  name: string;
  parent_key?: string;
};

export type ZoteroAttachment = {
  key: string;
  title: string;
  mime_type: string;
  path?: string;
};

export type PdfAnnotation = {
  citekey: string;
  page: number;
  text: string;
  comment?: string;
  color?: string;
  type: "highlight" | "note" | "underline";
};

export type ZoteroConnectionConfig = {
  mode: "bbt" | "web_api";
  bbt_url?: string;
  api_key?: string;
  user_id?: string;
  group_id?: string;
};
