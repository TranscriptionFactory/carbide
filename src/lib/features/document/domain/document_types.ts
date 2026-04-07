export type { DocumentFileType } from "$lib/features/document/types/document";

import type { DocumentFileType } from "$lib/features/document/types/document";

const SPECIAL_TYPE_MAP: Record<string, DocumentFileType> = {
  ".pdf": "pdf",
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".svg": "image",
  ".webp": "image",
  ".canvas": "canvas",
  ".excalidraw": "excalidraw",
};

const BINARY_DENYLIST: ReadonlySet<string> = new Set([
  ".docx",
  ".xlsx",
  ".pptx",
  ".zip",
  ".gz",
  ".tar",
  ".7z",
  ".rar",
  ".dmg",
  ".app",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".wasm",
  ".class",
  ".o",
  ".obj",
]);

const NOTE_EXTENSIONS: ReadonlySet<string> = new Set([".md"]);

export function detect_file_type(filename: string): DocumentFileType | null {
  const dot_index = filename.lastIndexOf(".");
  if (dot_index === -1) return null;
  const ext = filename.slice(dot_index).toLowerCase();

  if (NOTE_EXTENSIONS.has(ext)) return null;
  if (BINARY_DENYLIST.has(ext)) return null;

  const special = SPECIAL_TYPE_MAP[ext];
  if (special) return special;

  return "text";
}
