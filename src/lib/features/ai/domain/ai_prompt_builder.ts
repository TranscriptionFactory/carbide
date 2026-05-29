import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";
import type {
  AiApplyTarget,
  AiMode,
  AiVaultContext,
  AiVaultContextNote,
} from "$lib/features/ai/domain/ai_types";
import type { AiInlineCommand } from "$lib/features/ai/domain/ai_inline_commands";

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

function format_note(n: AiVaultContextNote): string {
  return `- ${n.title} (${n.path}): ${n.blurb}`;
}

function vault_context_sections(ctx: AiVaultContext): string {
  const entries: [string, AiVaultContextNote[]][] = [
    ["similar_notes", ctx.similar_notes],
    ["backlinks", ctx.backlinks],
    ["outlinks", ctx.outlinks],
  ];
  return entries
    .filter(([, notes]) => notes.length > 0)
    .map(([label, notes]) => section(label, notes.map(format_note).join("\n")))
    .join("\n\n");
}

export function build_ai_prompt(input: {
  note_path: NotePath;
  note_markdown: MarkdownText;
  selection: EditorSelectionSnapshot | null;
  user_prompt: string;
  target: AiApplyTarget;
  mode: AiMode;
  vault_context?: AiVaultContext;
}): string {
  const user_prompt = input.user_prompt.trim();
  const selected_text = selection_text(input.selection);

  function append_vault_context(parts: string[]) {
    const ctx = input.vault_context;
    if (!ctx) return;
    const sections_str = vault_context_sections(ctx);
    if (!sections_str) return;
    parts.push(
      "Related notes from the vault are provided for additional context.",
    );
    parts.push(sections_str);
  }

  if (input.mode === "ask") {
    if (input.target === "selection" && selected_text) {
      const parts = [
        "You are a helpful assistant answering a question about a selected passage from a markdown note.",
        "Answer the user's question clearly and concisely.",
        "Do not return edited markdown. Do not rewrite the text.",
        `Note path: ${input.note_path}`,
        section("selected_text", selected_text),
        section("full_note_context", input.note_markdown),
      ];
      append_vault_context(parts);
      parts.push(section("user_question", user_prompt));
      return parts.join("\n\n");
    }

    const parts = [
      "You are a helpful assistant answering a question about the content of a markdown document.",
      "Answer the user's question clearly and concisely.",
      "Do not return edited markdown. Do not rewrite the text.",
      `Note path: ${input.note_path}`,
      section("note_markdown", input.note_markdown),
    ];
    append_vault_context(parts);
    parts.push(section("user_question", user_prompt));
    return parts.join("\n\n");
  }

  if (input.target === "selection" && selected_text) {
    const parts = [
      "You are editing a selected passage from a markdown document.",
      "Return ONLY the replacement text for the selected passage and retain all content that is not meant to be edited.",
      "Do not include commentary, explanations, or enclose the markdown in code fences.",
      "Do not return the full note.",
      `Note path: ${input.note_path}`,
      section("selected_text", selected_text),
      section("full_note_context", input.note_markdown),
    ];
    append_vault_context(parts);
    parts.push(section("user_instructions", user_prompt));
    return parts.join("\n\n");
  }

  const parts = [
    "You are editing a markdown document.",
    "Return ONLY the complete edited markdown for the document and retain all content that is not meant to be edited.",
    "Do not include commentary, explanations, or enclose the markdown in code fences.",
    `Note path: ${input.note_path}`,
    section("current_markdown", input.note_markdown),
  ];
  append_vault_context(parts);
  parts.push(section("user_instructions", user_prompt));
  return parts.join("\n\n");
}

export function build_ai_html_prompt(input: {
  file_path: string;
  file_title: string;
  html: string;
  user_prompt: string;
  mode: AiMode;
}): string {
  const user_prompt = input.user_prompt.trim();

  if (input.mode === "ask") {
    return [
      "You are a helpful assistant answering a question about the content of an HTML document.",
      "Answer the user's question clearly and concisely.",
      "Do not return edited HTML. Do not rewrite the markup.",
      `Document: ${input.file_title} (${input.file_path})`,
      section("current_html", input.html),
      section("user_question", user_prompt),
    ].join("\n\n");
  }

  return [
    "You are editing an HTML document.",
    "Return ONLY the complete edited HTML for the document and retain all content that is not meant to be edited.",
    "Do not include commentary, explanations, or enclose the HTML in code fences.",
    `Document: ${input.file_title} (${input.file_path})`,
    section("current_html", input.html),
    section("user_instructions", user_prompt),
  ].join("\n\n");
}

export function build_ai_inline_prompt(input: {
  command_id: string;
  custom_prompt?: string;
  context_text: string;
  selection_text?: string;
  commands?: AiInlineCommand[];
}): { system_prompt: string; user_prompt: string } {
  const { command_id, custom_prompt, context_text, selection_text, commands } =
    input;

  if (command_id === "custom") {
    return {
      system_prompt: custom_prompt ?? "Follow the user's instructions.",
      user_prompt: selection_text || context_text,
    };
  }

  const matched = commands?.find((c) => c.id === command_id);

  const system_prompt =
    matched?.system_prompt ??
    "Follow the user's instructions. Output only the result.";

  const user_prompt =
    matched?.use_selection && selection_text ? selection_text : context_text;

  return { system_prompt, user_prompt };
}
