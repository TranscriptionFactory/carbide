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
