import { describe, expect, it } from "vitest";
import { build_ai_prompt } from "$lib/features/ai";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";

describe("build_ai_prompt", () => {
  it("builds a full-note rewrite prompt", () => {
    const prompt = build_ai_prompt({
      note_path: as_note_path("docs/demo.md"),
      note_markdown: as_markdown_text("# Demo\n\nHello"),
      selection: null,
      user_prompt: "Make it more concise",
      target: "full_note",
      mode: "edit",
    });

    expect(prompt).toContain("Return ONLY the complete edited markdown");
    expect(prompt).toContain("<current_markdown>");
    expect(prompt).toContain("Make it more concise");
  });

  it("builds a selection-only replacement prompt", () => {
    const prompt = build_ai_prompt({
      note_path: as_note_path("docs/demo.md"),
      note_markdown: as_markdown_text("# Demo\n\nHello world"),
      selection: {
        text: "Hello world",
        start: 8,
        end: 19,
      },
      user_prompt: "Turn this into a bullet",
      target: "selection",
      mode: "edit",
    });

    expect(prompt).toContain("Return ONLY the replacement text");
    expect(prompt).toContain("<selected_text>");
    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("<full_note_context>");
  });

  it("builds an ask prompt for full note", () => {
    const prompt = build_ai_prompt({
      note_path: as_note_path("docs/demo.md"),
      note_markdown: as_markdown_text("# Demo\n\nHello"),
      selection: null,
      user_prompt: "What tone is this written in?",
      target: "full_note",
      mode: "ask",
    });

    expect(prompt).toContain(
      "answering a question about the content of a markdown document",
    );
    expect(prompt).toContain("<user_question>");
    expect(prompt).toContain("What tone is this written in?");
    expect(prompt).not.toContain("Return ONLY");
  });

  it("builds an ask prompt for selection", () => {
    const prompt = build_ai_prompt({
      note_path: as_note_path("docs/demo.md"),
      note_markdown: as_markdown_text("# Demo\n\nHello world"),
      selection: {
        text: "Hello world",
        start: 8,
        end: 19,
      },
      user_prompt: "Is this too informal?",
      target: "selection",
      mode: "ask",
    });

    expect(prompt).toContain("answering a question about a selected passage");
    expect(prompt).toContain("<selected_text>");
    expect(prompt).toContain("<user_question>");
    expect(prompt).not.toContain("Return ONLY");
  });
});
