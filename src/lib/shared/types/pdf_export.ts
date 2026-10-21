export type PdfPageSize = "a3" | "a4" | "a5" | "letter" | "legal" | "tabloid";
export type PdfMargin = "default" | "minimal" | "none";

export type PdfExportOptions = {
  page_size: PdfPageSize;
  landscape: boolean;
  margin: PdfMargin;
  downscale_percent: number;
  include_title: boolean;
};

export type PdfPageDimensions = {
  width_mm: number;
  height_mm: number;
};

export const PDF_PAGE_SIZES: Record<
  PdfPageSize,
  PdfPageDimensions & { label: string }
> = {
  a3: { label: "A3", width_mm: 297, height_mm: 420 },
  a4: { label: "A4", width_mm: 210, height_mm: 297 },
  a5: { label: "A5", width_mm: 148, height_mm: 210 },
  letter: { label: "Letter", width_mm: 215.9, height_mm: 279.4 },
  legal: { label: "Legal", width_mm: 215.9, height_mm: 355.6 },
  tabloid: { label: "Tabloid", width_mm: 279.4, height_mm: 431.8 },
};

export const PDF_MARGINS: Record<PdfMargin, { label: string; css: string }> = {
  default: { label: "Default", css: "18mm 16mm" },
  minimal: { label: "Minimal", css: "6mm" },
  none: { label: "None", css: "0" },
};

export const PDF_DOWNSCALE_MIN = 10;
export const PDF_DOWNSCALE_MAX = 100;

export const DEFAULT_PDF_EXPORT_OPTIONS: PdfExportOptions = {
  page_size: "a4",
  landscape: false,
  margin: "default",
  downscale_percent: 100,
  include_title: true,
};

export function pdf_page_dimensions(
  options: PdfExportOptions,
): PdfPageDimensions {
  const { width_mm, height_mm } = PDF_PAGE_SIZES[options.page_size];
  return options.landscape
    ? { width_mm: height_mm, height_mm: width_mm }
    : { width_mm, height_mm };
}

function clamp_downscale(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PDF_EXPORT_OPTIONS.downscale_percent;
  }
  return Math.min(
    PDF_DOWNSCALE_MAX,
    Math.max(PDF_DOWNSCALE_MIN, Math.round(value)),
  );
}

export function coerce_pdf_export_options(value: unknown): PdfExportOptions {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_PDF_EXPORT_OPTIONS;
  return {
    page_size: Object.hasOwn(PDF_PAGE_SIZES, record.page_size as string)
      ? (record.page_size as PdfPageSize)
      : defaults.page_size,
    landscape:
      typeof record.landscape === "boolean"
        ? record.landscape
        : defaults.landscape,
    margin: Object.hasOwn(PDF_MARGINS, record.margin as string)
      ? (record.margin as PdfMargin)
      : defaults.margin,
    downscale_percent: clamp_downscale(record.downscale_percent),
    include_title:
      typeof record.include_title === "boolean"
        ? record.include_title
        : defaults.include_title,
  };
}
