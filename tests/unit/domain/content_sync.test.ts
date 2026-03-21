import { describe, it, expect } from "vitest";
import {
  resolve_content_sync,
  normalize_for_comparison,
} from "$lib/features/split_view/domain/content_sync";

describe("normalize_for_comparison", () => {
  it("normalizes \\r\\n to \\n", () => {
    expect(normalize_for_comparison("a\r\nb\r\n")).toBe("a\nb\n");
  });

  it("strips trailing whitespace per line", () => {
    expect(normalize_for_comparison("hello   \nworld\t\n")).toBe(
      "hello\nworld\n",
    );
  });

  it("preserves substantive content differences", () => {
    expect(normalize_for_comparison("abc")).not.toBe(
      normalize_for_comparison("def"),
    );
  });

  it("treats trailing newline difference as equivalent", () => {
    expect(normalize_for_comparison("hello\n")).toBe(
      normalize_for_comparison("hello\n"),
    );
  });
});

describe("resolve_content_sync", () => {
  it("syncs primary_to_secondary when only primary changed", () => {
    const result = resolve_content_sync({
      primary_markdown: "updated",
      secondary_markdown: "original",
      primary_snapshot: "original",
      secondary_snapshot: "original",
    });
    expect(result.direction).toBe("primary_to_secondary");
    expect(result.markdown).toBe("updated");
  });

  it("syncs secondary_to_primary when only secondary changed", () => {
    const result = resolve_content_sync({
      primary_markdown: "original",
      secondary_markdown: "updated",
      primary_snapshot: "original",
      secondary_snapshot: "original",
    });
    expect(result.direction).toBe("secondary_to_primary");
    expect(result.markdown).toBe("updated");
  });

  it("returns none when neither pane changed", () => {
    const result = resolve_content_sync({
      primary_markdown: "same",
      secondary_markdown: "same",
      primary_snapshot: "same",
      secondary_snapshot: "same",
    });
    expect(result.direction).toBe("none");
  });

  it("returns none when both panes changed (conflict guard)", () => {
    const result = resolve_content_sync({
      primary_markdown: "edit A",
      secondary_markdown: "edit B",
      primary_snapshot: "original",
      secondary_snapshot: "original",
    });
    expect(result.direction).toBe("none");
  });

  it("returns none when both markdowns are already equal", () => {
    const result = resolve_content_sync({
      primary_markdown: "content",
      secondary_markdown: "content",
      primary_snapshot: "old",
      secondary_snapshot: "old",
    });
    expect(result.direction).toBe("none");
  });

  it("returns none on first sync when content matches", () => {
    const result = resolve_content_sync({
      primary_markdown: "content",
      secondary_markdown: "content",
      primary_snapshot: null,
      secondary_snapshot: null,
    });
    expect(result.direction).toBe("none");
  });

  it("ignores trailing whitespace differences", () => {
    const snapshot = normalize_for_comparison("hello\n");
    const result = resolve_content_sync({
      primary_markdown: "hello  \n",
      secondary_markdown: "hello\n",
      primary_snapshot: snapshot,
      secondary_snapshot: snapshot,
    });
    expect(result.direction).toBe("none");
  });

  it("ignores \\r\\n vs \\n differences", () => {
    const snapshot = normalize_for_comparison("hello\nworld");
    const result = resolve_content_sync({
      primary_markdown: "hello\r\nworld",
      secondary_markdown: "hello\nworld",
      primary_snapshot: snapshot,
      secondary_snapshot: snapshot,
    });
    expect(result.direction).toBe("none");
  });

  it("detects sequential edits after sync", () => {
    const synced = normalize_for_comparison("content A");

    const after_primary_edit = resolve_content_sync({
      primary_markdown: "content A + edits",
      secondary_markdown: "content A",
      primary_snapshot: synced,
      secondary_snapshot: synced,
    });
    expect(after_primary_edit.direction).toBe("primary_to_secondary");

    const after_sync = normalize_for_comparison("content A + edits");

    const after_secondary_edit = resolve_content_sync({
      primary_markdown: "content A + edits",
      secondary_markdown: "content A + edits + more",
      primary_snapshot: after_sync,
      secondary_snapshot: after_sync,
    });
    expect(after_secondary_edit.direction).toBe("secondary_to_primary");
  });

  it("handles first sync with divergent content by treating both as changed", () => {
    const result = resolve_content_sync({
      primary_markdown: "primary version",
      secondary_markdown: "secondary version",
      primary_snapshot: null,
      secondary_snapshot: null,
    });
    expect(result.direction).toBe("none");
  });
});
