import { describe, expect, test } from "vitest";
import { create_untitled_open_note } from "$lib/features/note";
import type { NotePath } from "$lib/shared/types/ids";
import { as_markdown_text } from "$lib/shared/types/ids";

describe("create_untitled_open_note", () => {
  test("creates Untitled-1 when no open titles exist", () => {
    const result = create_untitled_open_note({
      open_titles: [],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
    expect(result.meta.title).toBe("Untitled-1");
    expect(result.is_dirty).toBe(true);
    expect(result.markdown).toBe(as_markdown_text(""));
  });

  test("creates Untitled-2 when Untitled-1 is open", () => {
    const result = create_untitled_open_note({
      open_titles: ["Untitled-1"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-2" as NotePath);
    expect(result.meta.title).toBe("Untitled-2");
  });

  test("picks max+1 without gap-filling", () => {
    const result = create_untitled_open_note({
      open_titles: ["Untitled-1", "Untitled-3"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-4" as NotePath);
    expect(result.meta.title).toBe("Untitled-4");
  });

  test("ignores non-untitled names", () => {
    const result = create_untitled_open_note({
      open_titles: ["foo", "bar", "welcome"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
  });

  test("ignores names that partially match untitled pattern", () => {
    const result = create_untitled_open_note({
      open_titles: ["Untitled-1-draft", "My-Untitled-2", "Untitled-abc"],
      now_ms: 1000,
    });

    expect(result.meta.path).toBe("draft:1000:Untitled-1" as NotePath);
  });
});
