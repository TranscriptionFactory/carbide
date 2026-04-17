import { describe, it, expect, vi, beforeEach } from "vitest";
import { parse_markdown } from "$lib/features/editor/adapters/markdown_pipeline";
import {
  parse_processor,
  fallback_parse_processor,
} from "$lib/features/editor/adapters/remark_plugins/remark_processor";

describe("markdown fallback deserialization", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("parses valid markdown normally", () => {
    const doc = parse_markdown("# Hello\n\nWorld");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBe(2);
    expect(doc.child(0).type.name).toBe("heading");
    expect(doc.child(1).type.name).toBe("paragraph");
  });

  it("returns valid doc for empty string", () => {
    const doc = parse_markdown("");
    expect(doc.type.name).toBe("doc");
  });

  it("falls back to reduced-plugin parser when primary throws", () => {
    vi.spyOn(parse_processor, "runSync").mockImplementationOnce(() => {
      throw new Error("primary parse exploded");
    });

    const doc = parse_markdown("# Still works\n\nVia fallback");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBeGreaterThan(0);
  });

  it("logs console.warn when primary parser fails", () => {
    const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(parse_processor, "runSync").mockImplementationOnce(() => {
      throw new Error("primary parse exploded");
    });

    parse_markdown("anything");

    expect(warn_spy).toHaveBeenCalledWith(
      expect.stringContaining("Primary parse failed"),
      expect.any(Error),
    );
    warn_spy.mockRestore();
  });

  it("returns empty doc when both primary and fallback throw", () => {
    const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.spyOn(parse_processor, "runSync").mockImplementationOnce(() => {
      throw new Error("primary parse exploded");
    });

    vi.spyOn(fallback_parse_processor, "runSync").mockImplementationOnce(() => {
      throw new Error("fallback also exploded");
    });

    const doc = parse_markdown("anything");
    expect(doc.type.name).toBe("doc");
    expect(doc.childCount).toBe(1);
    expect(doc.child(0).type.name).toBe("paragraph");

    expect(warn_spy).toHaveBeenCalledWith(
      expect.stringContaining("Fallback parse also failed"),
      expect.any(Error),
    );
    warn_spy.mockRestore();
  });
});
