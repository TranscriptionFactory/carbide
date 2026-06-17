export type DocumentFileType =
  | "pdf"
  | "image"
  | "text"
  | "html"
  | "epub"
  | "canvas"
  | "excalidraw";

export function is_binary_type(file_type: DocumentFileType): boolean {
  return file_type === "pdf" || file_type === "image" || file_type === "epub";
}

export function is_editable_type(file_type: DocumentFileType): boolean {
  return file_type === "text" || file_type === "html";
}

export type HtmlViewMode = "source" | "safe" | "live";

export const HTML_VIEW_MODES: readonly HtmlViewMode[] = [
  "source",
  "safe",
  "live",
] as const;

export type ArtifactProvenance = {
  source: string;
  pasted_at: string;
  [key: string]: unknown;
};

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
