// Pin 5: one prompt module for "edit the open tab", both targets. The
// document wording moved verbatim from ai_prompt_builder's
// build_ai_document_prompt (edit branch); the note variant reuses the
// full-note wording of build_ai_note_prompt without the vault-context block.

import { section } from "$lib/features/assistant/domain/chat_prompt_builder";

export function build_document_edit_prompt(input: {
  file_path: string;
  file_title: string;
  content: string;
  instructions: string;
}): string {
  return [
    "You are editing a document. The document's format is indicated by its file extension.",
    "Return ONLY the complete edited content for the document and retain all content that is not meant to be edited.",
    "Do not include commentary, explanations, or enclose the content in code fences.",
    `Document: ${input.file_title} (${input.file_path})`,
    section("current_content", input.content),
    section("user_instructions", input.instructions.trim()),
  ].join("\n\n");
}

export function build_note_edit_prompt(input: {
  note_path: string;
  content: string;
  instructions: string;
}): string {
  return [
    "You are editing a markdown document.",
    "Return ONLY the complete edited markdown for the document and retain all content that is not meant to be edited.",
    "Do not include commentary, explanations, or enclose the markdown in code fences.",
    `Note path: ${input.note_path}`,
    section("current_markdown", input.content),
    section("user_instructions", input.instructions.trim()),
  ].join("\n\n");
}
