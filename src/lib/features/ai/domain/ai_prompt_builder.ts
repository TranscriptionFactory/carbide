import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";
import type { AiApplyTarget, AiMode } from "$lib/features/ai/domain/ai_types";

function section(label: string, value: string): string {
  return `<${label}>\n${value}\n</${label}>`;
}

function selection_text(
  selection: EditorSelectionSnapshot | null,
): string | null {
  if (!selection) return null;
  const trimmed = selection.text.trim();
  return trimmed === "" ? null : selection.text;
}

export function build_ai_prompt(input: {
  note_path: NotePath;
  note_markdown: MarkdownText;
  selection: EditorSelectionSnapshot | null;
  user_prompt: string;
  target: AiApplyTarget;
  mode: AiMode;
}): string {
  const user_prompt = input.user_prompt.trim();
  const selected_text = selection_text(input.selection);

  if (input.mode === "ask") {
    if (input.target === "selection" && selected_text) {
      return [
        "You are a helpful assistant answering a question about a selected passage from a markdown note.",
        "Answer the user's question clearly and concisely.",
        "Do not return edited markdown. Do not rewrite the text.",
        `Note path: ${input.note_path}`,
        section("selected_text", selected_text),
        section("full_note_context", input.note_markdown),
        section("user_question", user_prompt),
      ].join("\n\n");
    }

    return [
      "You are a helpful assistant answering a question about a markdown note.",
      "Answer the user's question clearly and concisely.",
      "Do not return edited markdown. Do not rewrite the text.",
      `Note path: ${input.note_path}`,
      section("note_markdown", input.note_markdown),
      section("user_question", user_prompt),
    ].join("\n\n");
  }

  if (input.target === "selection" && selected_text) {
    return [
      "You are editing a selected passage from a markdown note.",
      "Return ONLY the replacement text for the selected passage.",
      "Do not include commentary, explanations, or code fences.",
      "Do not return the full note.",
      `Note path: ${input.note_path}`,
      section("selected_text", selected_text),
      section("full_note_context", input.note_markdown),
      section("user_instructions", user_prompt),
    ].join("\n\n");
  }

  return [
    "You are editing a markdown note.",
    "Return ONLY the complete edited markdown for the note.",
    "Do not include commentary, explanations, or code fences.",
    `Note path: ${input.note_path}`,
    section("current_markdown", input.note_markdown),
    section("user_instructions", user_prompt),
  ].join("\n\n");
}
