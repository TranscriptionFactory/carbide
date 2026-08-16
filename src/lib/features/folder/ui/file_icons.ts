import BookOpen from "@lucide/svelte/icons/book-open";
import File from "@lucide/svelte/icons/file";
import FileCode from "@lucide/svelte/icons/file-code";
import FileImage from "@lucide/svelte/icons/file-image";
import FileSpreadsheet from "@lucide/svelte/icons/file-spreadsheet";
import FileText from "@lucide/svelte/icons/file-text";
import FileType from "@lucide/svelte/icons/file-type";
import Frame from "@lucide/svelte/icons/frame";

const IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "ico",
]);
const CODE_EXTENSIONS = new Set([
  "ts",
  "js",
  "tsx",
  "jsx",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "cpp",
  "h",
  "html",
  "css",
  "json",
  "yaml",
  "yml",
  "toml",
  "sh",
]);
const SHEET_EXTENSIONS = new Set(["csv", "tsv", "xlsx", "xls"]);
const TEXT_EXTENSIONS = new Set(["md", "markdown", "mdx", "txt", "rtf", "log"]);

export function file_icon_component(ext: string) {
  const lower = ext.toLowerCase();
  if (lower === "pdf") return FileType;
  if (lower === "epub") return BookOpen;
  if (lower === "canvas") return Frame;
  if (IMAGE_EXTENSIONS.has(lower)) return FileImage;
  if (CODE_EXTENSIONS.has(lower)) return FileCode;
  if (SHEET_EXTENSIONS.has(lower)) return FileSpreadsheet;
  if (TEXT_EXTENSIONS.has(lower)) return FileText;
  return File;
}

export function file_icon_for_path(path: string) {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const dot = name.lastIndexOf(".");
  return file_icon_component(dot > 0 ? name.slice(dot + 1) : "");
}
