import { describe, it, expect } from "vitest";
import { create_citationjs_adapter } from "$lib/features/reference/adapters/citationjs_adapter";

const SAMPLE_BIBTEX = `@article{smith2024,
  title = {A Study of Things},
  author = {Smith, John and Doe, Jane},
  journal = {Journal of Studies},
  year = {2024},
  volume = {42},
  pages = {1--10},
  doi = {10.1234/test}
}`;

const SAMPLE_RIS = `TY  - JOUR
TI  - An RIS Article
AU  - Johnson, Alice
PY  - 2023
JO  - Science Today
VL  - 7
SP  - 100
EP  - 110
ER  - `;

describe("citationjs_adapter", () => {
  const adapter = create_citationjs_adapter();

  describe("parse_bibtex", () => {
    it("parses a valid BibTeX entry into CslItems", async () => {
      const items = await adapter.parse_bibtex(SAMPLE_BIBTEX);
      expect(items).toHaveLength(1);
      const item = items[0]!;
      expect(item.title).toBe("A Study of Things");
      expect(item.type).toBe("article-journal");
      expect(item.author).toHaveLength(2);
      expect(item.author![0]!.family).toBe("Smith");
      expect(item.author![0]!.given).toBe("John");
    });

    it("handles multiple entries", async () => {
      const double = `${SAMPLE_BIBTEX}\n@book{doe2023,
        title = {Another Book},
        author = {Doe, Jane},
        year = {2023},
        publisher = {Press}
      }`;
      const items = await adapter.parse_bibtex(double);
      expect(items).toHaveLength(2);
    });
  });

  describe("parse_ris", () => {
    it("parses a valid RIS entry", async () => {
      const items = await adapter.parse_ris(SAMPLE_RIS);
      expect(items).toHaveLength(1);
      expect(items[0]!.title).toBe("An RIS Article");
    });
  });

  describe("render_bibliography", () => {
    it("renders APA bibliography as text", async () => {
      const items = await adapter.parse_bibtex(SAMPLE_BIBTEX);
      const result = await adapter.render_bibliography(items, "apa", "text");
      expect(result).toContain("Smith");
      expect(result).toContain("2024");
    });

    it("renders APA bibliography as HTML", async () => {
      const items = await adapter.parse_bibtex(SAMPLE_BIBTEX);
      const result = await adapter.render_bibliography(items, "apa", "html");
      expect(result).toContain("Smith");
    });
  });

  describe("render_citation", () => {
    it("renders inline citation", async () => {
      const items = await adapter.parse_bibtex(SAMPLE_BIBTEX);
      const result = await adapter.render_citation(items, "apa", "text");
      expect(result).toBeTruthy();
    });
  });

  describe("list_styles", () => {
    it("returns available citation styles", () => {
      const styles = adapter.list_styles();
      expect(styles).toContain("apa");
      expect(styles.length).toBeGreaterThanOrEqual(3);
    });
  });
});
