import { describe, expect, it } from "vitest";
import {
  compute_active_heading_id,
  compute_visible_headings,
} from "$lib/features/outline";
import type { OutlineHeading } from "$lib/features/outline";

function heading(level: number, text: string, pos: number): OutlineHeading {
  return { id: `h-${String(level)}-${text}-${String(pos)}`, level, text, pos };
}

describe("compute_visible_headings", () => {
  const doc = [
    heading(1, "intro", 0),
    heading(2, "setup", 10),
    heading(3, "deps", 20),
    heading(2, "usage", 30),
    heading(1, "outro", 40),
  ];

  it("returns all headings when nothing is collapsed", () => {
    expect(compute_visible_headings(doc, new Set())).toEqual(doc);
  });

  it("hides descendants of a collapsed heading", () => {
    const visible = compute_visible_headings(doc, new Set([doc[1]!.id]));
    expect(visible.map((h) => h.text)).toEqual([
      "intro",
      "setup",
      "usage",
      "outro",
    ]);
  });

  it("hides entire subtree of a collapsed top-level heading", () => {
    const visible = compute_visible_headings(doc, new Set([doc[0]!.id]));
    expect(visible.map((h) => h.text)).toEqual(["intro", "outro"]);
  });

  it("keeps hidden children hidden when their parent is also collapsed", () => {
    const visible = compute_visible_headings(
      doc,
      new Set([doc[0]!.id, doc[1]!.id]),
    );
    expect(visible.map((h) => h.text)).toEqual(["intro", "outro"]);
  });

  it("resumes visibility at a sibling of equal level", () => {
    const visible = compute_visible_headings(doc, new Set([doc[2]!.id]));
    expect(visible).toEqual(doc);
  });
});

describe("compute_active_heading_id", () => {
  const doc = [heading(1, "a", 0), heading(2, "b", 10), heading(1, "c", 20)];
  const tops = [100, 500, 900];

  it("returns null when there are no headings", () => {
    expect(compute_active_heading_id([], [], 0, 1000)).toBeNull();
  });

  it("returns null when geometry is missing", () => {
    expect(compute_active_heading_id(doc, [], 0, 1000)).toBeNull();
  });

  it("falls back to the first heading before any is scrolled past", () => {
    expect(compute_active_heading_id(doc, tops, 0, 1000)).toBe(doc[0]!.id);
  });

  it("activates the last heading above the threshold", () => {
    expect(compute_active_heading_id(doc, tops, 450, 1000)).toBe(doc[1]!.id);
  });

  it("activates a heading within the 80px threshold band", () => {
    expect(compute_active_heading_id(doc, tops, 830, 1000)).toBe(doc[2]!.id);
  });

  it("activates the last heading when scrolled to the bottom", () => {
    expect(compute_active_heading_id(doc, tops, 999, 1000)).toBe(doc[2]!.id);
  });

  it("ignores the bottom rule when the container does not scroll", () => {
    expect(compute_active_heading_id(doc, tops, 0, 0)).toBe(doc[0]!.id);
  });
});
