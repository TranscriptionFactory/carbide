import { describe, expect, it } from "vitest";
import {
  build_document_edit_prompt,
  build_note_edit_prompt,
} from "$lib/features/assistant";

describe("build_document_edit_prompt", () => {
  it("carries the document identity, content and trimmed instructions", () => {
    const prompt = build_document_edit_prompt({
      file_path: "artifacts/report.html",
      file_title: "report",
      content: "<h1>Old</h1>",
      instructions: "  make the heading friendlier  ",
    });

    expect(prompt).toContain("Document: report (artifacts/report.html)");
    expect(prompt).toContain(
      "<current_content>\n<h1>Old</h1>\n</current_content>",
    );
    expect(prompt).toContain(
      "<user_instructions>\nmake the heading friendlier\n</user_instructions>",
    );
    expect(prompt).toContain("Return ONLY the complete edited content");
  });
});

describe("build_note_edit_prompt", () => {
  it("uses the full-note markdown wording", () => {
    const prompt = build_note_edit_prompt({
      note_path: "notes/plan.md",
      content: "# Plan",
      instructions: "tighten it",
    });

    expect(prompt).toContain("You are editing a markdown document.");
    expect(prompt).toContain("Note path: notes/plan.md");
    expect(prompt).toContain("<current_markdown>\n# Plan\n</current_markdown>");
    expect(prompt).toContain(
      "<user_instructions>\ntighten it\n</user_instructions>",
    );
  });
});
