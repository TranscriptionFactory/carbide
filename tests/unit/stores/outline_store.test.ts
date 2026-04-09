import { describe, expect, it } from "vitest";
import { OutlineStore } from "$lib/features/outline";
import type { OutlineHeading } from "$lib/features/outline";

function heading(level: number, text: string, pos: number): OutlineHeading {
  const slug = `h-${String(level)}-${text
    .toLowerCase()
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")}`;
  return { id: `${slug}-0`, level, text, pos };
}

describe("OutlineStore", () => {
  it("starts empty", () => {
    const store = new OutlineStore();
    expect(store.headings).toEqual([]);
    expect(store.active_heading_id).toBeNull();
    expect(store.collapsed_ids.size).toBe(0);
  });

  it("sets headings", () => {
    const store = new OutlineStore();
    const headings = [heading(1, "Title", 0), heading(2, "Section", 10)];
    store.set_headings(headings);
    expect(store.headings).toEqual(headings);
  });

  it("prunes stale collapsed IDs on set_headings", () => {
    const store = new OutlineStore();
    const h_a = heading(1, "A", 0);
    const h_b = heading(2, "B", 10);
    store.set_headings([h_a, h_b]);
    store.toggle_collapsed(h_a.id);
    store.toggle_collapsed(h_b.id);
    expect(store.collapsed_ids.size).toBe(2);

    const h_c = heading(2, "C", 20);
    store.set_headings([h_a, h_c]);
    expect(store.collapsed_ids.has(h_a.id)).toBe(true);
    expect(store.collapsed_ids.has(h_b.id)).toBe(false);
    expect(store.collapsed_ids.size).toBe(1);
  });

  it("sets active heading", () => {
    const store = new OutlineStore();
    store.set_active_heading("h-5");
    expect(store.active_heading_id).toBe("h-5");
  });

  it("sets active heading to null", () => {
    const store = new OutlineStore();
    store.set_active_heading("h-5");
    store.set_active_heading(null);
    expect(store.active_heading_id).toBeNull();
  });

  it("toggles collapsed state", () => {
    const store = new OutlineStore();
    const id = heading(1, "Test", 0).id;
    expect(store.collapsed_ids.has(id)).toBe(false);

    store.toggle_collapsed(id);
    expect(store.collapsed_ids.has(id)).toBe(true);

    store.toggle_collapsed(id);
    expect(store.collapsed_ids.has(id)).toBe(false);
  });

  it("clears all state", () => {
    const store = new OutlineStore();
    const h = heading(1, "Title", 0);
    store.set_headings([h]);
    store.set_active_heading(h.id);
    store.toggle_collapsed(h.id);

    store.clear();

    expect(store.headings).toEqual([]);
    expect(store.active_heading_id).toBeNull();
    expect(store.collapsed_ids.size).toBe(0);
  });

  it("preserves collapse state across tab switches", () => {
    const store = new OutlineStore();

    const note_a_headings = [heading(1, "Intro", 0), heading(2, "Details", 10)];
    store.set_headings(note_a_headings, "note-a.md");
    store.toggle_collapsed(note_a_headings[0]!.id);
    expect(store.collapsed_ids.has(note_a_headings[0]!.id)).toBe(true);

    const note_b_headings = [heading(1, "Other", 0)];
    store.set_headings(note_b_headings, "note-b.md");
    expect(store.collapsed_ids.has(note_a_headings[0]!.id)).toBe(false);
    expect(store.collapsed_ids.size).toBe(0);

    store.set_headings(note_a_headings, "note-a.md");
    expect(store.collapsed_ids.has(note_a_headings[0]!.id)).toBe(true);
    expect(store.collapsed_ids.size).toBe(1);
  });

  describe("find_heading_by_fragment", () => {
    it("returns heading for exact text match", () => {
      const store = new OutlineStore();
      const h = heading(1, "My Heading", 42);
      store.set_headings([h]);
      expect(store.find_heading_by_fragment("My Heading")).toBe(h);
    });

    it("returns heading for case-insensitive match", () => {
      const store = new OutlineStore();
      const h = heading(2, "Introduction", 10);
      store.set_headings([h]);
      expect(store.find_heading_by_fragment("introduction")).toBe(h);
      expect(store.find_heading_by_fragment("INTRODUCTION")).toBe(h);
    });

    it("returns heading for slugified match", () => {
      const store = new OutlineStore();
      const h = heading(1, "My Heading", 0);
      store.set_headings([h]);
      expect(store.find_heading_by_fragment("my-heading")).toBe(h);
    });

    it("returns undefined for no match", () => {
      const store = new OutlineStore();
      store.set_headings([heading(1, "Title", 0)]);
      expect(store.find_heading_by_fragment("nonexistent")).toBeUndefined();
    });
  });

  it("clears current note but saves state for restore", () => {
    const store = new OutlineStore();
    const h = heading(1, "Title", 0);
    store.set_headings([h], "saved.md");
    store.toggle_collapsed(h.id);

    store.clear();

    store.set_headings([h], "saved.md");
    expect(store.collapsed_ids.has(h.id)).toBe(true);
  });
});
