import { describe, it, expect } from "vitest";
import {
  annotations_to_markdown,
  merge_annotations,
} from "$lib/features/reference/domain/annotation_to_markdown";
import { make_annotation } from "./helpers";

describe("annotations_to_markdown", () => {
  it("returns empty string for no annotations", () => {
    expect(annotations_to_markdown([], "smith2024")).toBe("");
  });

  it("renders a single highlight", () => {
    const result = annotations_to_markdown([make_annotation()], "smith2024");
    expect(result).toContain("# Annotations: smith2024");
    expect(result).toContain("## Page 1");
    expect(result).toContain("**Highlight**");
    expect(result).toContain("> highlighted text");
  });

  it("groups annotations by page", () => {
    const annotations = [
      make_annotation({ page: 3, text: "page three" }),
      make_annotation({ page: 1, text: "page one" }),
      make_annotation({ page: 3, text: "also page three" }),
    ];
    const result = annotations_to_markdown(annotations, "smith2024");
    const page1_pos = result.indexOf("## Page 1");
    const page3_pos = result.indexOf("## Page 3");
    expect(page1_pos).toBeLessThan(page3_pos);
    expect(result).toContain("> page one");
    expect(result).toContain("> page three");
    expect(result).toContain("> also page three");
  });

  it("includes comment when present", () => {
    const result = annotations_to_markdown(
      [make_annotation({ comment: "my note" })],
      "smith2024",
    );
    expect(result).toContain("my note");
  });

  it("renders color labels for known colors", () => {
    const result = annotations_to_markdown(
      [make_annotation({ color: "#ffd400" })],
      "smith2024",
    );
    expect(result).toContain("(Yellow)");
  });

  it("renders raw color for unknown colors", () => {
    const result = annotations_to_markdown(
      [make_annotation({ color: "#123456" })],
      "smith2024",
    );
    expect(result).toContain("(#123456)");
  });

  it("renders different annotation types", () => {
    const annotations = [
      make_annotation({ type: "note", text: "a note" }),
      make_annotation({ type: "underline", text: "underlined" }),
    ];
    const result = annotations_to_markdown(annotations, "smith2024");
    expect(result).toContain("**Note**");
    expect(result).toContain("**Underline**");
  });

  it("shows page number in each annotation", () => {
    const result = annotations_to_markdown(
      [make_annotation({ page: 42 })],
      "smith2024",
    );
    expect(result).toContain("p. 42");
  });

  it("ends with a newline", () => {
    const result = annotations_to_markdown([make_annotation()], "smith2024");
    expect(result.endsWith("\n")).toBe(true);
  });
});

describe("merge_annotations", () => {
  it("merges non-overlapping annotations", () => {
    const existing = [make_annotation({ page: 1, text: "first" })];
    const incoming = [make_annotation({ page: 2, text: "second" })];
    const merged = merge_annotations(existing, incoming);
    expect(merged).toHaveLength(2);
  });

  it("deduplicates by page+text", () => {
    const existing = [make_annotation({ page: 1, text: "same" })];
    const incoming = [make_annotation({ page: 1, text: "same" })];
    const merged = merge_annotations(existing, incoming);
    expect(merged).toHaveLength(1);
  });

  it("keeps both when same page but different text", () => {
    const existing = [make_annotation({ page: 1, text: "alpha" })];
    const incoming = [make_annotation({ page: 1, text: "beta" })];
    const merged = merge_annotations(existing, incoming);
    expect(merged).toHaveLength(2);
  });

  it("preserves existing order and appends new", () => {
    const existing = [
      make_annotation({ page: 1, text: "a" }),
      make_annotation({ page: 2, text: "b" }),
    ];
    const incoming = [
      make_annotation({ page: 2, text: "b" }),
      make_annotation({ page: 3, text: "c" }),
    ];
    const merged = merge_annotations(existing, incoming);
    expect(merged).toHaveLength(3);
    expect(merged[0]!.text).toBe("a");
    expect(merged[1]!.text).toBe("b");
    expect(merged[2]!.text).toBe("c");
  });

  it("handles empty existing", () => {
    const incoming = [make_annotation({ page: 1, text: "new" })];
    const merged = merge_annotations([], incoming);
    expect(merged).toHaveLength(1);
  });

  it("handles empty incoming", () => {
    const existing = [make_annotation({ page: 1, text: "old" })];
    const merged = merge_annotations(existing, []);
    expect(merged).toHaveLength(1);
  });
});
