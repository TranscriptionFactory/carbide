import { describe, expect, it } from "vitest";
import { build_ai_prompt } from "$lib/features/ai";
import { as_markdown_text, as_note_path } from "$lib/shared/types/ids";
import type { AiVaultContext } from "$lib/features/ai/domain/ai_types";

const base_input = {
  note_path: as_note_path("docs/demo.md"),
  note_markdown: as_markdown_text("# Demo\n\nHello"),
  selection: null as null,
  user_prompt: "Make it more concise",
  target: "full_note" as const,
  mode: "edit" as const,
};

const sample_vault_context: AiVaultContext = {
  similar_notes: [
    {
      path: "docs/related.md",
      title: "Related Note",
      blurb: "A related topic",
    },
  ],
  backlinks: [
    { path: "docs/linker.md", title: "Linker", blurb: "Links to this note" },
  ],
  outlinks: [
    { path: "docs/target.md", title: "Target", blurb: "Linked from this note" },
  ],
};

describe("build_ai_prompt", () => {
  it("builds a full-note rewrite prompt", () => {
    const prompt = build_ai_prompt(base_input);

    expect(prompt).toContain("Return ONLY the complete edited markdown");
    expect(prompt).toContain("<current_markdown>");
    expect(prompt).toContain("Make it more concise");
  });

  it("builds a selection-only replacement prompt", () => {
    const prompt = build_ai_prompt({
      ...base_input,
      note_markdown: as_markdown_text("# Demo\n\nHello world"),
      selection: { text: "Hello world", start: 8, end: 19 },
      user_prompt: "Turn this into a bullet",
      target: "selection",
    });

    expect(prompt).toContain("Return ONLY the replacement text");
    expect(prompt).toContain("<selected_text>");
    expect(prompt).toContain("Hello world");
    expect(prompt).toContain("<full_note_context>");
  });

  it("builds an ask prompt for full note", () => {
    const prompt = build_ai_prompt({
      ...base_input,
      user_prompt: "What tone is this written in?",
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
      ...base_input,
      note_markdown: as_markdown_text("# Demo\n\nHello world"),
      selection: { text: "Hello world", start: 8, end: 19 },
      user_prompt: "Is this too informal?",
      target: "selection",
      mode: "ask",
    });

    expect(prompt).toContain("answering a question about a selected passage");
    expect(prompt).toContain("<selected_text>");
    expect(prompt).toContain("<user_question>");
    expect(prompt).not.toContain("Return ONLY");
  });

  describe("vault context", () => {
    it("includes similar_notes section when provided", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<similar_notes>");
      expect(prompt).toContain(
        "Related Note (docs/related.md): A related topic",
      );
      expect(prompt).toContain("</similar_notes>");
    });

    it("includes backlinks section when provided", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<backlinks>");
      expect(prompt).toContain("Linker (docs/linker.md): Links to this note");
      expect(prompt).toContain("</backlinks>");
    });

    it("includes outlinks section when provided", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<outlinks>");
      expect(prompt).toContain(
        "Target (docs/target.md): Linked from this note",
      );
      expect(prompt).toContain("</outlinks>");
    });

    it("adds context explanation line when vault context is present", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain(
        "Related notes from the vault are provided for additional context.",
      );
    });

    it("omits sections for empty arrays", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: {
          similar_notes: [{ path: "a.md", title: "A", blurb: "blurb" }],
          backlinks: [],
          outlinks: [],
        },
      });

      expect(prompt).toContain("<similar_notes>");
      expect(prompt).not.toContain("<backlinks>");
      expect(prompt).not.toContain("<outlinks>");
    });

    it("omits all vault context when all arrays are empty", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: {
          similar_notes: [],
          backlinks: [],
          outlinks: [],
        },
      });

      expect(prompt).not.toContain("<similar_notes>");
      expect(prompt).not.toContain("<backlinks>");
      expect(prompt).not.toContain("<outlinks>");
      expect(prompt).not.toContain("Related notes from the vault");
    });

    it("produces identical output when vault_context is not provided", () => {
      const without = build_ai_prompt(base_input);
      const with_no_ctx = build_ai_prompt({ ...base_input });
      expect(without).toBe(with_no_ctx);
    });

    it("works for ask x selection with vault context", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        selection: { text: "Hello", start: 0, end: 5 },
        target: "selection",
        mode: "ask",
        user_prompt: "Explain this",
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<similar_notes>");
      expect(prompt).toContain("<user_question>");
      expect(prompt).toContain("answering a question about a selected passage");
    });

    it("works for ask x full note with vault context", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        mode: "ask",
        user_prompt: "Summarize",
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<similar_notes>");
      expect(prompt).toContain("<user_question>");
    });

    it("works for edit x selection with vault context", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        selection: { text: "Hello", start: 0, end: 5 },
        target: "selection",
        mode: "edit",
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<similar_notes>");
      expect(prompt).toContain("<user_instructions>");
      expect(prompt).toContain("Return ONLY the replacement text");
    });

    it("works for edit x full note with vault context", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        mode: "edit",
        vault_context: sample_vault_context,
      });

      expect(prompt).toContain("<similar_notes>");
      expect(prompt).toContain("<user_instructions>");
      expect(prompt).toContain("Return ONLY the complete edited markdown");
    });

    it("places vault context after note content but before user prompt", () => {
      const prompt = build_ai_prompt({
        ...base_input,
        vault_context: sample_vault_context,
      });

      const markdown_pos = prompt.indexOf("<current_markdown>");
      const similar_pos = prompt.indexOf("<similar_notes>");
      const instructions_pos = prompt.indexOf("<user_instructions>");

      expect(markdown_pos).toBeLessThan(similar_pos);
      expect(similar_pos).toBeLessThan(instructions_pos);
    });
  });
});

import { build_ai_html_prompt } from "$lib/features/ai";

describe("build_ai_html_prompt", () => {
  const base = {
    file_path: "notes/chart.html",
    file_title: "chart",
    html: "<html><body><h1>Hi</h1></body></html>",
    user_prompt: "Add a footer",
    mode: "edit" as const,
  };

  it("builds an HTML rewrite prompt", () => {
    const prompt = build_ai_html_prompt(base);

    expect(prompt).toContain("You are editing an HTML document.");
    expect(prompt).toContain(
      "Return ONLY the complete edited HTML for the document",
    );
    expect(prompt).toContain("Do not include commentary");
    expect(prompt).toContain("<current_html>");
    expect(prompt).toContain(base.html);
    expect(prompt).toContain("<user_instructions>");
    expect(prompt).toContain("Add a footer");
    expect(prompt).toContain("chart (notes/chart.html)");
  });

  it("builds an HTML ask prompt without rewrite instructions", () => {
    const prompt = build_ai_html_prompt({
      ...base,
      mode: "ask",
      user_prompt: "What does this page render?",
    });

    expect(prompt).toContain(
      "answering a question about the content of an HTML document",
    );
    expect(prompt).toContain("<user_question>");
    expect(prompt).toContain("What does this page render?");
    expect(prompt).not.toContain("Return ONLY");
  });
});
