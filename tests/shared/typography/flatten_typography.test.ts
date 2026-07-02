import { describe, it, expect } from "vitest";
import { flatten_typography } from "$lib/shared/typography/flatten_typography";

describe("flatten_typography", () => {
  it("flattens a single-level spec into kebab-case CSS vars", () => {
    const result = flatten_typography({ lineHeight: 1.85, maxWidth: "min(85ch, 90%)" }, "--editor-body-")
    expect(result["--editor-body-line-height"]).toBe("1.85")
    expect(result["--editor-body-max-width"]).toBe("min(85ch, 90%)")
  })

  it("appends px to numeric values that are not weight/lineHeight/opacity", () => {
    const result = flatten_typography({ marginTop: 32, fontSize: 16 }, "--editor-")
    expect(result["--editor-margin-top"]).toBe("32px")
    expect(result["--editor-font-size"]).toBe("16px")
  })

  it("keeps fontWeight unitless", () => {
    const result = flatten_typography({ fontWeight: 700 }, "--editor-")
    expect(result["--editor-font-weight"]).toBe("700")
  })

  it("keeps lineHeight unitless", () => {
    const result = flatten_typography({ lineHeight: 1.2 }, "--editor-")
    expect(result["--editor-line-height"]).toBe("1.2")
  })

  it("keeps opacity unitless", () => {
    const result = flatten_typography({ opacity: 0.5 }, "--editor-")
    expect(result["--editor-opacity"]).toBe("0.5")
  })

  it("passes string values through unchanged (em, calc, etc)", () => {
    const result = flatten_typography({ letterSpacing: "-0.01em" }, "--editor-")
    expect(result["--editor-letter-spacing"]).toBe("-0.01em")
  })

  it("recursively flattens nested objects with compound keys", () => {
    const spec = {
      headings: {
        h1: { fontWeight: 700, lineHeight: 1.2 }
      }
    }
    const result = flatten_typography(spec, "--editor-")
    expect(result["--editor-headings-h1-font-weight"]).toBe("700")
    expect(result["--editor-headings-h1-line-height"]).toBe("1.2")
  })

  it("converts camelCase keys to kebab-case", () => {
    const result = flatten_typography({ marginBottom: 12 }, "--editor-")
    expect(result["--editor-margin-bottom"]).toBe("12px")
  })

  it("produces expected flat map for full typography spec", () => {
    const spec = {
      body: { lineHeight: 1.85, maxWidth: "min(85ch, 90%)" },
      headings: {
        h1: { fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.01em" },
        h2: { fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.005em" }
      }
    }
    const result = flatten_typography(spec, "--editor-")

    expect(result["--editor-body-line-height"]).toBe("1.85")
    expect(result["--editor-body-max-width"]).toBe("min(85ch, 90%)")
    expect(result["--editor-headings-h1-font-weight"]).toBe("700")
    expect(result["--editor-headings-h1-line-height"]).toBe("1.2")
    expect(result["--editor-headings-h1-letter-spacing"]).toBe("-0.01em")
    expect(result["--editor-headings-h2-font-weight"]).toBe("600")
    expect(result["--editor-headings-h2-line-height"]).toBe("1.3")
    expect(result["--editor-headings-h2-letter-spacing"]).toBe("-0.005em")
  })

  it("skips array values", () => {
    const result = flatten_typography({ nested: ["a", "b"] } as never, "--editor-")
    expect(Object.keys(result)).toHaveLength(0)
  })
})
