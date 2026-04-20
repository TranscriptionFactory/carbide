import { describe, expect, it } from "vitest";
import { build_ai_inline_prompt } from "$lib/features/ai/domain/ai_prompt_builder";

describe("build_ai_inline_prompt", () => {
  it("returns continue prompt using context_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "continue",
      context_text: "The quick brown fox",
    });
    expect(result.system_prompt).toContain("Continue writing naturally");
    expect(result.user_prompt).toBe("The quick brown fox");
  });

  it("returns summarize prompt using context_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "summarize",
      context_text: "Long document text here",
    });
    expect(result.system_prompt).toContain("concise summary");
    expect(result.user_prompt).toBe("Long document text here");
  });

  it("returns expand prompt using context_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "expand",
      context_text: "Brief text",
    });
    expect(result.system_prompt).toContain("Expand and elaborate");
    expect(result.user_prompt).toBe("Brief text");
  });

  it("returns improve prompt using selection_text when available", () => {
    const result = build_ai_inline_prompt({
      command_id: "improve",
      context_text: "Full document",
      selection_text: "Selected passage",
    });
    expect(result.system_prompt).toContain("Improve the clarity");
    expect(result.user_prompt).toBe("Selected passage");
  });

  it("falls back to context_text for selection commands without selection", () => {
    const result = build_ai_inline_prompt({
      command_id: "improve",
      context_text: "Full document",
    });
    expect(result.user_prompt).toBe("Full document");
  });

  it("returns simplify prompt using selection_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "simplify",
      context_text: "Full doc",
      selection_text: "Complex sentence here",
    });
    expect(result.system_prompt).toContain("Simplify");
    expect(result.user_prompt).toBe("Complex sentence here");
  });

  it("returns fix_grammar prompt using selection_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "fix_grammar",
      context_text: "Full doc",
      selection_text: "Teh quck brwon fox",
    });
    expect(result.system_prompt).toContain("Fix spelling and grammar");
    expect(result.user_prompt).toBe("Teh quck brwon fox");
  });

  it("returns translate prompt using selection_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "translate",
      context_text: "Full doc",
      selection_text: "Bonjour le monde",
    });
    expect(result.system_prompt).toContain("Translate");
    expect(result.user_prompt).toBe("Bonjour le monde");
  });

  it("handles custom command with custom_prompt", () => {
    const result = build_ai_inline_prompt({
      command_id: "custom",
      custom_prompt: "Rewrite as a haiku",
      context_text: "Some text",
      selection_text: "Selected text",
    });
    expect(result.system_prompt).toBe("Rewrite as a haiku");
    expect(result.user_prompt).toBe("Selected text");
  });

  it("handles custom command without selection_text", () => {
    const result = build_ai_inline_prompt({
      command_id: "custom",
      custom_prompt: "Make it shorter",
      context_text: "Some text",
    });
    expect(result.system_prompt).toBe("Make it shorter");
    expect(result.user_prompt).toBe("Some text");
  });

  it("handles custom command without custom_prompt", () => {
    const result = build_ai_inline_prompt({
      command_id: "custom",
      context_text: "Some text",
    });
    expect(result.system_prompt).toBe("Follow the user's instructions.");
    expect(result.user_prompt).toBe("Some text");
  });

  it("handles unknown command with fallback prompt", () => {
    const result = build_ai_inline_prompt({
      command_id: "nonexistent",
      context_text: "Some text",
    });
    expect(result.system_prompt).toContain("Follow the user's instructions");
    expect(result.user_prompt).toBe("Some text");
  });
});
