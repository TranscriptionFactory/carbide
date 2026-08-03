import { describe, expect, it } from "vitest";
import { describe_ai_context_preview } from "$lib/features/ai/domain/ai_context_preview";

describe("describe_ai_context_preview", () => {
  it("describes selection payloads with note identity and counts", () => {
    const preview = describe_ai_context_preview({
      note_path: "docs/demo.md",
      note_title: "Demo",
      target: "selection",
      original_text: "Alpha\nBeta",
    });

    expect(preview).toEqual({
      scope_label: "Selection",
      payload_label: "Selected text payload",
      note_label: "Demo · docs/demo.md",
      char_count: 10,
      line_count: 2,
    });
  });

  it("falls back to current note when identity is missing", () => {
    const preview = describe_ai_context_preview({
      note_path: null,
      note_title: null,
      target: "full_note",
      original_text: "",
    });

    expect(preview.note_label).toBe("Current note");
    expect(preview.scope_label).toBe("Full Note");
    expect(preview.payload_label).toBe("Full note payload");
    expect(preview.char_count).toBe(0);
    expect(preview.line_count).toBe(0);
  });
});
