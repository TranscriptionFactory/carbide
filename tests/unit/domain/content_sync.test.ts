import { describe, it, expect } from "vitest";
import {
  resolve_content_sync_direction,
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

describe("resolve_content_sync_direction", () => {
  it("returns primary_to_secondary when primary changed", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "updated",
      secondary_markdown: "original",
      last_synced_primary: "original",
      last_synced_secondary: "original",
    });
    expect(result.direction).toBe("primary_to_secondary");
    expect(result.markdown).toBe("updated");
  });

  it("returns secondary_to_primary when secondary changed", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "original",
      secondary_markdown: "updated",
      last_synced_primary: "original",
      last_synced_secondary: "original",
    });
    expect(result.direction).toBe("secondary_to_primary");
    expect(result.markdown).toBe("updated");
  });

  it("returns none when neither changed", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "same",
      secondary_markdown: "same",
      last_synced_primary: "same",
      last_synced_secondary: "same",
    });
    expect(result.direction).toBe("none");
  });

  it("returns none when both changed simultaneously", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "change-a",
      secondary_markdown: "change-b",
      last_synced_primary: "original",
      last_synced_secondary: "original",
    });
    expect(result.direction).toBe("none");
  });

  it("returns none when initial state with matching markdown", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "same",
      secondary_markdown: "same",
      last_synced_primary: null,
      last_synced_secondary: null,
    });
    expect(result.direction).toBe("none");
  });

  it("returns primary_to_secondary for initial state with differing markdown", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "primary content",
      secondary_markdown: "secondary content",
      last_synced_primary: null,
      last_synced_secondary: null,
    });
    expect(result.direction).toBe("primary_to_secondary");
    expect(result.markdown).toBe("primary content");
  });

  it("ignores trailing whitespace differences", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "hello  \n",
      secondary_markdown: "hello\n",
      last_synced_primary: "hello\n",
      last_synced_secondary: "hello\n",
    });
    expect(result.direction).toBe("none");
  });

  it("ignores \\r\\n vs \\n differences", () => {
    const result = resolve_content_sync_direction({
      primary_markdown: "hello\r\nworld",
      secondary_markdown: "hello\nworld",
      last_synced_primary: "hello\nworld",
      last_synced_secondary: "hello\nworld",
    });
    expect(result.direction).toBe("none");
  });
});
