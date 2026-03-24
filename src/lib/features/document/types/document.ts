export type DocumentFileType =
  | "pdf"
  | "image"
  | "csv"
  | "code"
  | "text"
  | "html"
  | "canvas"
  | "excalidraw";

export type PdfMetadata = {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  creation_date?: string;
  mod_date?: string;
  page_count: number;
};
