import type { EditorSelectionSnapshot } from "$lib/shared/types/editor";
import type { MarkdownText, NotePath } from "$lib/shared/types/ids";
import type {
  AiApplyTarget,
  AiMode,
  AiVaultContext,
  AiVaultContextNote,
} from "$lib/features/ai/domain/ai_types";
import type { InstructionRecipe } from "$lib/shared/types/prompt_recipe";
import type { AssembledBlock, ContextAssembly } from "$lib/features/assistant";

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

export function build_ai_document_prompt(input: {
  file_path: string;
  file_title: string;
  content: string;
  user_prompt: string;
  mode: AiMode;
}): string {
  const user_prompt = input.user_prompt.trim();

  if (input.mode === "ask") {
    return [
      "You are a helpful assistant answering a question about the content of a document. The document's format is indicated by its file extension.",
      "Answer the user's question clearly and concisely.",
      "Do not return edited content. Do not rewrite the document.",
      `Document: ${input.file_title} (${input.file_path})`,
      section("current_content", input.content),
      section("user_question", user_prompt),
    ].join("\n\n");
  }

  return [
    "You are editing a document. The document's format is indicated by its file extension.",
    "Return ONLY the complete edited content for the document and retain all content that is not meant to be edited.",
    "Do not include commentary, explanations, or enclose the content in code fences.",
    `Document: ${input.file_title} (${input.file_path})`,
    section("current_content", input.content),
    section("user_instructions", user_prompt),
  ].join("\n\n");
}

const VAULT_SECTION_LABELS: [string, string][] = [
  ["similar_notes", "similar_notes"],
  ["backlinks", "backlinks"],
  ["outlinks", "outlinks"],
];

function assembled_note_line(block: AssembledBlock): string {
  return `- ${block.title} (${block.note_path ?? ""}): ${block.text}`;
}

// Rebuilt from the assembly rather than the raw context: the assembler owns
// order, dedup and truncation, and each surface renders its own headings.
function assembled_vault_sections(assembly: ContextAssembly): string {
  return VAULT_SECTION_LABELS.map(([source_id, label]) => {
    const blocks = assembly.blocks.filter((b) => b.source_id === source_id);
    if (blocks.length === 0) return "";
    return section(label, blocks.map(assembled_note_line).join("\n"));
  })
    .filter((part) => part !== "")
    .join("\n\n");
}

function with_vault_context(
  system_prompt: string,
  assembly: ContextAssembly,
): string {
  const sections_str = assembled_vault_sections(assembly);
  if (!sections_str) return system_prompt;
  return [
    system_prompt,
    "Related notes from the vault are provided for additional context.",
    sections_str,
  ].join("\n\n");
}

function source_text(assembly: ContextAssembly, source_id: string): string {
  return assembly.blocks.find((b) => b.source_id === source_id)?.text ?? "";
}

// The selection is a preference, not an alternative: an empty selection still
// falls back to the cursor window.
function inline_user_prompt(
  assembly: ContextAssembly,
  prefer_selection: boolean,
): string {
  const window_text = source_text(assembly, "cursor_window");
  if (!prefer_selection) return window_text;
  return source_text(assembly, "selection") || window_text;
}

export function build_ai_inline_prompt(input: {
  command_id: string;
  custom_prompt?: string;
  assembly: ContextAssembly;
  commands?: InstructionRecipe[];
}): { system_prompt: string; user_prompt: string } {
  const { command_id, custom_prompt, assembly, commands } = input;

  if (command_id === "custom") {
    return {
      system_prompt: with_vault_context(
        custom_prompt ?? "Follow the user's instructions.",
        assembly,
      ),
      user_prompt: inline_user_prompt(assembly, true),
    };
  }

  const matched = commands?.find((c) => c.id === command_id);

  const system_prompt =
    matched?.system_prompt ??
    "Follow the user's instructions. Output only the result.";

  return {
    system_prompt: with_vault_context(system_prompt, assembly),
    user_prompt: inline_user_prompt(assembly, matched?.use_selection === true),
  };
}
