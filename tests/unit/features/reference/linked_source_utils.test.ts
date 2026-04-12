import { describe, expect, it } from "vitest";
import {
  scan_entry_to_linked_meta,
  derive_title_from_filename,
  parse_author_string,
  parse_creation_date,
  generate_linked_source_id,
  linked_note_to_csl_item,
  linked_note_to_meta,
} from "$lib/features/reference/domain/linked_source_utils";
import type { ScanEntry, LinkedNoteInfo } from "$lib/features/reference/types";

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
    isbn: null,
    arxiv_id: null,
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

describe("scan_entry_to_linked_meta", () => {
  it("converts full entry to LinkedSourceMeta", () => {
    const entry = make_entry();
    const meta = scan_entry_to_linked_meta(entry, "source-1");

    expect(meta.citekey).toMatch(/smith2024/);
    expect(meta.item_type).toBe("article");
    expect(meta.authors).toBe("Smith, John; Doe, Jane");
    expect(meta.year).toBe(2024);
    expect(meta.doi).toBe("10.1234/test.5678");
    expect(meta.external_file_path).toBe(
      "/home/user/papers/machine_learning.pdf",
    );
    expect(meta.linked_source_id).toBe("source-1");
    expect(meta.abstract).toBe("An introduction to deep learning");
  });

  it("sets item_type to webpage for HTML files", () => {
    const entry = make_entry({ file_path: "/home/user/pages/index.html" });
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.item_type).toBe("webpage");
  });

  it("handles entry with no author", () => {
    const entry = make_entry({ author: null });
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.authors).toBeUndefined();
    expect(meta.citekey).toMatch(/unknown2024/);
  });

  it("handles entry with no creation_date", () => {
    const entry = make_entry({ creation_date: null });
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.year).toBeUndefined();
    expect(meta.citekey).toMatch(/smithnd/);
  });

  it("omits optional fields when not present", () => {
    const entry = make_entry({
      doi: null,
      isbn: null,
      arxiv_id: null,
      subject: null,
    });
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.doi).toBeUndefined();
    expect(meta.isbn).toBeUndefined();
    expect(meta.arxiv_id).toBeUndefined();
    expect(meta.abstract).toBeUndefined();
  });

  it("maps isbn when present", () => {
    const entry = make_entry({ isbn: "9783161484100" });
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.isbn).toBe("9783161484100");
  });

  it("maps arxiv_id when present", () => {
    const entry = make_entry({ arxiv_id: "2301.07041v2" });
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.arxiv_id).toBe("2301.07041v2");
  });

  it("generates unique citekeys for different file paths", () => {
    const entry1 = make_entry({ file_path: "/a/paper.pdf" });
    const entry2 = make_entry({ file_path: "/b/paper.pdf" });
    const meta1 = scan_entry_to_linked_meta(entry1, "s1");
    const meta2 = scan_entry_to_linked_meta(entry2, "s1");
    expect(meta1.citekey).not.toBe(meta2.citekey);
  });

  it("enriches with relative paths when vault_root and home_dir provided", () => {
    const entry = make_entry({
      file_path: "/Users/abir/projects/linked/paper.pdf",
    });
    const meta = scan_entry_to_linked_meta(
      entry,
      "source-1",
      "/Users/abir/projects/vault",
      "/Users/abir",
    );
    expect(meta.vault_relative_path).toBe("../linked/paper.pdf");
    expect(meta.home_relative_path).toBe("~/projects/linked/paper.pdf");
  });

  it("omits relative paths when vault_root and home_dir not provided", () => {
    const entry = make_entry();
    const meta = scan_entry_to_linked_meta(entry, "source-1");
    expect(meta.vault_relative_path).toBeUndefined();
    expect(meta.home_relative_path).toBeUndefined();
  });
});

describe("parse_creation_date", () => {
  it("parses PDF date format D:YYYYMMDD", () => {
    expect(parse_creation_date("D:20240315120000")).toEqual({
      "date-parts": [[2024, 3, 15]],
    });
  });

  it("parses PDF date with only year and month", () => {
    expect(parse_creation_date("D:202403")).toEqual({
      "date-parts": [[2024, 3]],
    });
  });

  it("parses PDF date with only year", () => {
    expect(parse_creation_date("D:2024")).toEqual({
      "date-parts": [[2024]],
    });
  });

  it("parses ISO date YYYY-MM-DD", () => {
    expect(parse_creation_date("2024-03-15")).toEqual({
      "date-parts": [[2024, 3, 15]],
    });
  });

  it("parses slash date YYYY/MM/DD", () => {
    expect(parse_creation_date("2024/03/15")).toEqual({
      "date-parts": [[2024, 3, 15]],
    });
  });

  it("parses year-only", () => {
    expect(parse_creation_date("2024")).toEqual({
      "date-parts": [[2024]],
    });
  });

  it("returns null for garbage input", () => {
    expect(parse_creation_date("not a date")).toBeNull();
  });

  it("returns null for implausible year", () => {
    expect(parse_creation_date("0001")).toBeNull();
  });
});

function make_note(overrides: Partial<LinkedNoteInfo> = {}): LinkedNoteInfo {
  return {
    path: "@linked/papers/machine_learning.pdf",
    title: "Deep Learning Fundamentals",
    mtime_ms: 1700000000000,
    citekey: "smith2024-abc123",
    authors: "Smith, John; Doe, Jane",
    year: 2024,
    doi: "10.1234/test.5678",
    item_type: "article",
    external_file_path: "/home/user/papers/machine_learning.pdf",
    linked_source_id: "source-1",
    journal: "Nature Machine Intelligence",
    abstract_text: "An introduction to deep learning",
    ...overrides,
  };
}

describe("linked_note_to_csl_item", () => {
  it("converts a full LinkedNoteInfo to CslItem", () => {
    const item = linked_note_to_csl_item(make_note());
    expect(item.id).toBe("smith2024-abc123");
    expect(item.type).toBe("article-journal");
    expect(item.title).toBe("Deep Learning Fundamentals");
    expect(item.author).toEqual([
      { family: "Smith", given: "John" },
      { family: "Doe", given: "Jane" },
    ]);
    expect(item.issued).toEqual({ "date-parts": [[2024]] });
    expect(item.DOI).toBe("10.1234/test.5678");
    expect(item["container-title"]).toBe("Nature Machine Intelligence");
    expect(item.abstract).toBe("An introduction to deep learning");
    expect(item.URL).toBe("/home/user/papers/machine_learning.pdf");
  });

  it("sets type to webpage for webpage item_type", () => {
    const item = linked_note_to_csl_item(make_note({ item_type: "webpage" }));
    expect(item.type).toBe("webpage");
  });

  it("uses empty string for id when citekey is missing", () => {
    const { citekey: _, ...rest } = make_note();
    const item = linked_note_to_csl_item(rest as LinkedNoteInfo);
    expect(item.id).toBe("");
  });

  it("omits optional fields when not present", () => {
    const {
      authors: _a,
      year: _y,
      doi: _d,
      journal: _j,
      abstract_text: _at,
      external_file_path: _ef,
      ...rest
    } = make_note();
    const item = linked_note_to_csl_item(rest as LinkedNoteInfo);
    expect(item.author).toBeUndefined();
    expect(item.issued).toBeUndefined();
    expect(item.DOI).toBeUndefined();
    expect(item["container-title"]).toBeUndefined();
    expect(item.abstract).toBeUndefined();
    expect(item.URL).toBeUndefined();
  });
});

describe("linked_note_to_meta", () => {
  it("sets blurb to the file name from external_file_path", () => {
    const meta = linked_note_to_meta(make_note());
    expect(meta.blurb).toBe("machine_learning.pdf");
  });

  it("falls back to virtual path file name when external_file_path is absent", () => {
    const { external_file_path: _, ...rest } = make_note();
    const meta = linked_note_to_meta(rest as LinkedNoteInfo);
    expect(meta.blurb).toBe("machine_learning.pdf");
  });

  it("uses name as title from info.title", () => {
    const meta = linked_note_to_meta(make_note());
    expect(meta.name).toBe("Deep Learning Fundamentals");
    expect(meta.title).toBe("Deep Learning Fundamentals");
  });

  it("sets source to linked", () => {
    const meta = linked_note_to_meta(make_note());
    expect(meta.source).toBe("linked");
  });

  it("carries over optional metadata fields", () => {
    const meta = linked_note_to_meta(make_note());
    expect(meta.citekey).toBe("smith2024-abc123");
    expect(meta.authors).toBe("Smith, John; Doe, Jane");
    expect(meta.year).toBe(2024);
    expect(meta.doi).toBe("10.1234/test.5678");
    expect(meta.external_file_path).toBe(
      "/home/user/papers/machine_learning.pdf",
    );
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
