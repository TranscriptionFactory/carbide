import { describe, expect, it } from "vitest";
import { parse_pdf_metadata } from "$lib/features/document/domain/parse_pdf_metadata";

describe("parse_pdf_metadata", () => {
  it("maps all fields from a fully populated info object", () => {
    const info = {
      Title: "My Document",
      Author: "Jane Doe",
      Subject: "Research",
      Keywords: "test, pdf",
      Creator: "Word",
      Producer: "Acrobat",
      CreationDate: "D:20230101120000",
      ModDate: "D:20230201120000",
    };

    const result = parse_pdf_metadata(info, 42);

    expect(result.page_count).toBe(42);
    expect(result.title).toBe("My Document");
    expect(result.author).toBe("Jane Doe");
    expect(result.subject).toBe("Research");
    expect(result.keywords).toBe("test, pdf");
    expect(result.creator).toBe("Word");
    expect(result.producer).toBe("Acrobat");
    expect(result.creation_date).toBe("D:20230101120000");
    expect(result.mod_date).toBe("D:20230201120000");
  });

  it("returns undefined for missing optional fields", () => {
    const result = parse_pdf_metadata({}, 5);

    expect(result.page_count).toBe(5);
    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
    expect(result.subject).toBeUndefined();
    expect(result.keywords).toBeUndefined();
    expect(result.creator).toBeUndefined();
    expect(result.producer).toBeUndefined();
    expect(result.creation_date).toBeUndefined();
    expect(result.mod_date).toBeUndefined();
  });

  it("returns undefined for whitespace-only string fields", () => {
    const info = { Title: "   ", Author: "\t" };
    const result = parse_pdf_metadata(info, 1);

    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
  });

  it("trims whitespace from string values", () => {
    const info = { Title: "  Trimmed Title  ", Author: " Author Name " };
    const result = parse_pdf_metadata(info, 3);

    expect(result.title).toBe("Trimmed Title");
    expect(result.author).toBe("Author Name");
  });

  it("returns undefined for non-string field values", () => {
    const info = { Title: 123, Author: null, Subject: true };
    const result = parse_pdf_metadata(info, 2);

    expect(result.title).toBeUndefined();
    expect(result.author).toBeUndefined();
    expect(result.subject).toBeUndefined();
  });

  it("handles partial info with only some fields populated", () => {
    const info = { Title: "Partial Doc", Producer: "LibreOffice" };
    const result = parse_pdf_metadata(info, 10);

    expect(result.title).toBe("Partial Doc");
    expect(result.producer).toBe("LibreOffice");
    expect(result.author).toBeUndefined();
    expect(result.keywords).toBeUndefined();
  });
});
