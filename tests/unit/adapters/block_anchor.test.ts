import { describe, it, expect } from "vitest";
import { find_block_anchor_position } from "$lib/features/editor/adapters/block_anchor";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";

describe("find_block_anchor_position", () => {
  it("finds the paragraph carrying a trailing block id", () => {
    const doc = parse_markdown("first\n\nsecond ^abc123\n\nthird");
    const pos = find_block_anchor_position(doc, "abc123");

    expect(pos).not.toBeNull();
    expect(doc.nodeAt(pos ?? 0)?.textContent).toBe("second ^abc123");
  });

  it("ignores a block id that is not at the end of the block", () => {
    const doc = parse_markdown("^abc123 leads the line");
    expect(find_block_anchor_position(doc, "abc123")).toBeNull();
  });

  it("returns null for an unknown block id", () => {
    const doc = parse_markdown("only text ^abc123");
    expect(find_block_anchor_position(doc, "missing")).toBeNull();
  });

  it("returns null for an empty block id", () => {
    const doc = parse_markdown("text ^abc123");
    expect(find_block_anchor_position(doc, "")).toBeNull();
  });

  it("finds a block id inside a list item", () => {
    const doc = parse_markdown("- alpha\n- beta ^xyz");
    const pos = find_block_anchor_position(doc, "xyz");

    expect(pos).not.toBeNull();
    expect(doc.nodeAt(pos ?? 0)?.textContent).toBe("beta ^xyz");
  });

  it("returns the first match when a block id repeats", () => {
    const doc = parse_markdown("one ^dup\n\ntwo ^dup");
    const first = find_block_anchor_position(doc, "dup");
    const second = find_block_anchor_position(doc, "dup");

    expect(first).toBe(second);
    expect(doc.nodeAt(first ?? 0)?.textContent).toBe("one ^dup");
  });
});
