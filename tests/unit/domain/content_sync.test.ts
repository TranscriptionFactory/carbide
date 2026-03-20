import { describe, it, expect } from "vitest";
import {
  resolve_active_pane_sync,
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

describe("resolve_active_pane_sync", () => {
  it("syncs primary_to_secondary when primary is active and content changed", () => {
    const result = resolve_active_pane_sync({
      active_pane: "primary",
      source_markdown: "updated",
      last_synced_content: "original",
    });
    expect(result.direction).toBe("primary_to_secondary");
    expect(result.markdown).toBe("updated");
  });

  it("syncs secondary_to_primary when secondary is active and content changed", () => {
    const result = resolve_active_pane_sync({
      active_pane: "secondary",
      source_markdown: "updated",
      last_synced_content: "original",
    });
    expect(result.direction).toBe("secondary_to_primary");
    expect(result.markdown).toBe("updated");
  });

  it("returns none when source matches last synced content", () => {
    const result = resolve_active_pane_sync({
      active_pane: "primary",
      source_markdown: "same",
      last_synced_content: "same",
    });
    expect(result.direction).toBe("none");
  });

  it("syncs on first run when last_synced_content is null", () => {
    const result = resolve_active_pane_sync({
      active_pane: "primary",
      source_markdown: "content",
      last_synced_content: null,
    });
    expect(result.direction).toBe("primary_to_secondary");
    expect(result.markdown).toBe("content");
  });

  it("ignores trailing whitespace differences", () => {
    const result = resolve_active_pane_sync({
      active_pane: "primary",
      source_markdown: "hello  \n",
      last_synced_content: "hello\n",
    });
    expect(result.direction).toBe("none");
  });

  it("ignores \\r\\n vs \\n differences", () => {
    const result = resolve_active_pane_sync({
      active_pane: "secondary",
      source_markdown: "hello\r\nworld",
      last_synced_content: "hello\nworld",
    });
    expect(result.direction).toBe("none");
  });

  it("detects change after pane switch", () => {
    const synced = "content A";
    const norm_synced = normalize_for_comparison(synced);

    const after_switch = resolve_active_pane_sync({
      active_pane: "secondary",
      source_markdown: synced,
      last_synced_content: norm_synced,
    });
    expect(after_switch.direction).toBe("none");

    const after_typing = resolve_active_pane_sync({
      active_pane: "secondary",
      source_markdown: "content A + edits",
      last_synced_content: norm_synced,
    });
    expect(after_typing.direction).toBe("secondary_to_primary");
  });

  it("direction follows active_pane regardless of which markdown is newer", () => {
    const result = resolve_active_pane_sync({
      active_pane: "secondary",
      source_markdown: "new content",
      last_synced_content: "old content",
    });
    expect(result.direction).toBe("secondary_to_primary");
  });
});
