import { describe, expect, it } from "vitest";
import {
  scan_entry_to_csl_item,
  derive_title_from_filename,
  parse_author_string,
  generate_linked_source_id,
} from "$lib/features/reference/domain/linked_source_utils";
import type { ScanEntry } from "$lib/features/reference/types";

function make_entry(overrides: Partial<ScanEntry> = {}): ScanEntry {
  return {
    file_path: "/home/user/papers/machine_learning.pdf",
    file_name: "machine_learning.pdf",
    file_type: "pdf",
    title: "Deep Learning Fundamentals",
    author: "Smith, John; Doe, Jane",
    subject: "An introduction to deep learning",
    keywords: "machine learning, neural networks",
    doi: "10.1234/test.5678",
    creation_date: "D:20240101120000",
    body_text: "body text",
    page_offsets: [0, 100],
    modified_at: 1700000000000,
    ...overrides,
  };
}

describe("derive_title_from_filename", () => {
  it("strips extension and replaces separators", () => {
    expect(derive_title_from_filename("/path/to/my_research_paper.pdf")).toBe(
      "my research paper",
    );
  });

  it("handles hyphens", () => {
    expect(derive_title_from_filename("deep-learning-review.html")).toBe(
      "deep learning review",
    );
  });

  it("splits camelCase", () => {
    expect(derive_title_from_filename("deepLearning.pdf")).toBe(
      "deep Learning",
    );
  });

  it("handles path with no extension", () => {
    expect(derive_title_from_filename("/path/README")).toBe("README");
  });
});

describe("parse_author_string", () => {
  it("parses semicolon-separated authors with family, given", () => {
    const result = parse_author_string("Smith, John; Doe, Jane");
    expect(result).toEqual([
      { family: "Smith", given: "John" },
      { family: "Doe", given: "Jane" },
    ]);
  });

  it("parses single author with family given", () => {
    const result = parse_author_string("John Smith");
    expect(result).toEqual([{ family: "Smith", given: "John" }]);
  });

  it("handles single-word author as literal", () => {
    const result = parse_author_string("UNESCO");
    expect(result).toEqual([{ literal: "UNESCO" }]);
  });

  it("handles empty string", () => {
    const result = parse_author_string("");
    expect(result).toEqual([]);
  });
});

describe("scan_entry_to_csl_item", () => {
  it("converts full entry to CslItem", () => {
    const entry = make_entry();
    const item = scan_entry_to_csl_item(entry, "source-1");

    expect(item.title).toBe("Deep Learning Fundamentals");
    expect(item.DOI).toBe("10.1234/test.5678");
    expect(item.type).toBe("article");
    expect(item.author).toEqual([
      { family: "Smith", given: "John" },
      { family: "Doe", given: "Jane" },
    ]);
    expect(item._linked_source_id).toBe("source-1");
    expect(item._linked_file_path).toBe(
      "/home/user/papers/machine_learning.pdf",
    );
    expect(item._source).toBe("linked_source");
    expect(item.keyword).toBe("machine learning, neural networks");
    expect(item.abstract).toBe("An introduction to deep learning");
    expect(item.id).toBeTruthy();
  });

  it("derives title from filename when title is null", () => {
    const entry = make_entry({ title: null });
    const item = scan_entry_to_csl_item(entry, "source-1");
    expect(item.title).toBe("machine learning");
  });

  it("handles entry with no author", () => {
    const entry = make_entry({ author: null });
    const item = scan_entry_to_csl_item(entry, "source-1");
    expect(item.author).toBeUndefined();
  });

  it("sets type to webpage for HTML files", () => {
    const entry = make_entry({ file_type: "html" });
    const item = scan_entry_to_csl_item(entry, "source-1");
    expect(item.type).toBe("webpage");
  });

  it("generates unique citekeys for different file paths", () => {
    const entry1 = make_entry({ file_path: "/a/paper.pdf" });
    const entry2 = make_entry({ file_path: "/b/paper.pdf" });
    const item1 = scan_entry_to_csl_item(entry1, "s1");
    const item2 = scan_entry_to_csl_item(entry2, "s1");
    expect(item1.id).not.toBe(item2.id);
  });
});

describe("generate_linked_source_id", () => {
  it("generates a UUID string", () => {
    const id = generate_linked_source_id();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 10 }, generate_linked_source_id));
    expect(ids.size).toBe(10);
  });
});
