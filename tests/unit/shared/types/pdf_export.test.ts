import { describe, expect, it } from "vitest";
import {
  DEFAULT_PDF_EXPORT_OPTIONS,
  coerce_pdf_export_options,
  pdf_page_dimensions,
} from "$lib/shared/types/pdf_export";

describe("pdf_page_dimensions", () => {
  it("returns the paper size in portrait", () => {
    expect(
      pdf_page_dimensions({ ...DEFAULT_PDF_EXPORT_OPTIONS, page_size: "a4" }),
    ).toEqual({ width_mm: 210, height_mm: 297 });
  });

  it("swaps width and height in landscape", () => {
    expect(
      pdf_page_dimensions({
        ...DEFAULT_PDF_EXPORT_OPTIONS,
        page_size: "letter",
        landscape: true,
      }),
    ).toEqual({ width_mm: 279.4, height_mm: 215.9 });
  });
});

describe("coerce_pdf_export_options", () => {
  it("returns the defaults for a non-object value", () => {
    expect(coerce_pdf_export_options("a4")).toEqual(DEFAULT_PDF_EXPORT_OPTIONS);
    expect(coerce_pdf_export_options(null)).toEqual(DEFAULT_PDF_EXPORT_OPTIONS);
  });

  it("keeps every valid field", () => {
    const options = {
      page_size: "tabloid",
      landscape: true,
      margin: "none",
      downscale_percent: 55,
      include_title: false,
    };
    expect(coerce_pdf_export_options(options)).toEqual(options);
  });

  it("replaces unknown page sizes and margins, including inherited keys", () => {
    const result = coerce_pdf_export_options({
      page_size: "toString",
      margin: "constructor",
    });
    expect(result.page_size).toBe("a4");
    expect(result.margin).toBe("default");
  });

  it("clamps and rounds the downscale percent", () => {
    expect(
      coerce_pdf_export_options({ downscale_percent: 3 }).downscale_percent,
    ).toBe(10);
    expect(
      coerce_pdf_export_options({ downscale_percent: 72.6 }).downscale_percent,
    ).toBe(73);
    expect(
      coerce_pdf_export_options({ downscale_percent: Number.NaN })
        .downscale_percent,
    ).toBe(100);
  });
});
