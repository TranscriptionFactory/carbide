import { describe, expect, it } from "vitest";
import { sync_source_editor_markdown } from "$lib/features/editor/domain/source_editor_sync";

describe("sync_source_editor_markdown", () => {
  it("initializes the local buffer from the external markdown", () => {
    expect(
      sync_source_editor_markdown({
        content: "",
        applied_markdown: null,
        next_markdown: "alpha",
      }),
    ).toEqual({
      content: "alpha",
      applied_markdown: "alpha",
    });
  });

  it("keeps local edits while the external markdown is still stale", () => {
    expect(
      sync_source_editor_markdown({
        content: "alpha!",
        applied_markdown: "alpha",
        next_markdown: "alpha",
      }),
    ).toEqual({
      content: "alpha!",
      applied_markdown: "alpha",
    });
  });

  it("accepts the external markdown once it catches up to the local edit", () => {
    expect(
      sync_source_editor_markdown({
        content: "alpha!",
        applied_markdown: "alpha",
        next_markdown: "alpha!",
      }),
    ).toEqual({
      content: "alpha!",
      applied_markdown: "alpha!",
    });
  });

  it("applies external markdown updates that differ from the local buffer", () => {
    expect(
      sync_source_editor_markdown({
        content: "alpha!",
        applied_markdown: "alpha!",
        next_markdown: "beta",
      }),
    ).toEqual({
      content: "beta",
      applied_markdown: "beta",
    });
  });

  it("skips replace when store already matches editor content", () => {
    expect(
      sync_source_editor_markdown({
        content: "hello",
        applied_markdown: "old",
        next_markdown: "hello",
      }),
    ).toEqual({
      content: "hello",
      applied_markdown: "hello",
    });
  });

  it("applies normalized round-trip that differs from editor content", () => {
    expect(
      sync_source_editor_markdown({
        content: "hello ",
        applied_markdown: "old",
        next_markdown: "hello",
      }),
    ).toEqual({
      content: "hello",
      applied_markdown: "hello",
    });
  });

  it("forces content update when applied_markdown is reset to null (note change)", () => {
    expect(
      sync_source_editor_markdown({
        content: "old note content",
        applied_markdown: null,
        next_markdown: "new note content",
      }),
    ).toEqual({
      content: "new note content",
      applied_markdown: "new note content",
    });
  });

  it("applies content even when old content matches applied_markdown after null reset", () => {
    const result = sync_source_editor_markdown({
      content: "note A",
      applied_markdown: null,
      next_markdown: "note B",
    });
    expect(result.content).toBe("note B");

    const no_op = sync_source_editor_markdown({
      content: "note B",
      applied_markdown: "note B",
      next_markdown: "note B",
    });
    expect(no_op.content).toBe("note B");
  });
});
