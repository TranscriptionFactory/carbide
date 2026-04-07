export type DocumentFileType =
  | "pdf"
  | "image"
  | "text"
  | "canvas"
  | "excalidraw";

export function is_binary_type(file_type: DocumentFileType): boolean {
  return file_type === "pdf" || file_type === "image";
}

export function is_editable_type(file_type: DocumentFileType): boolean {
  return file_type === "text";
}

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
