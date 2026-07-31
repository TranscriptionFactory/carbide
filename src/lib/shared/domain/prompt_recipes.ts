import type {
  AiInlineCommand,
  InstructionRecipe,
  QuestionRecipe,
} from "$lib/shared/types/prompt_recipe";

// `instruction` recipes run under the inline-edit policy (diff-applied against a
// selection); `question` recipes run under the chat policy (answered into a session).
// Only instructions are user-overridable, so only they go through resolve_instructions.
export const BUILTIN_INSTRUCTIONS: InstructionRecipe[] = [
  {
    mode: "instruction",
    id: "continue",
    label: "Continue writing",
    description: "Extend from cursor",
    system_prompt:
      "Continue writing naturally from where the text ends. Match the tone and style. Output only the continuation text.",
    use_selection: false,
    is_builtin: true,
  },
  {
    mode: "instruction",
    id: "summarize",
    label: "Summarize",
    description: "Summarize the note",
    system_prompt:
      "Write a concise summary of the following text. Output only the summary.",
    use_selection: false,
    is_builtin: true,
  },
  {
    mode: "instruction",
    id: "expand",
    label: "Expand",
    description: "Elaborate on surrounding text",
    system_prompt:
      "Expand and elaborate on the following text. Output only the expanded text.",
    use_selection: false,
    is_builtin: true,
  },
  {
    mode: "instruction",
    id: "improve",
    label: "Improve writing",
    description: "Improve clarity and style",
    system_prompt:
      "Improve the clarity and style of the following text. Output only the improved text.",
    use_selection: true,
    is_builtin: true,
  },
  {
    mode: "instruction",
    id: "simplify",
    label: "Simplify",
    description: "Make simpler and shorter",
    system_prompt:
      "Simplify the following text. Make it shorter and clearer. Output only the simplified text.",
    use_selection: true,
    is_builtin: true,
  },
  {
    mode: "instruction",
    id: "fix_grammar",
    label: "Fix grammar",
    description: "Fix spelling and grammar",
    system_prompt:
      "Fix spelling and grammar errors in the following text. Output only the corrected text.",
    use_selection: true,
    is_builtin: true,
  },
  {
    mode: "instruction",
    id: "translate",
    label: "Translate",
    description: "Translate to another language",
    system_prompt:
      "Translate the following text to English. Output only the translation.",
    use_selection: true,
    is_builtin: true,
  },
];

export const BUILTIN_QUESTIONS: QuestionRecipe[] = [
  {
    mode: "question",
    id: "summarize_scope",
    label: "Summarize",
    build: (where) => `Summarize the key points and themes across ${where}.`,
    is_builtin: true,
  },
  {
    mode: "question",
    id: "extract_action_items",
    label: "Action items",
    build: (where) =>
      `List every action item, todo, and open task mentioned in ${where}, with the note each comes from.`,
    is_builtin: true,
  },
  {
    mode: "question",
    id: "open_questions",
    label: "Open questions",
    build: (where) =>
      `What open questions or unresolved threads remain in ${where}?`,
    is_builtin: true,
  },
  {
    mode: "question",
    id: "timeline",
    label: "Timeline",
    build: (where) =>
      `Build a chronological timeline of what I wrote in ${where}.`,
    is_builtin: true,
  },
];

export function to_inline_command(recipe: InstructionRecipe): AiInlineCommand {
  const { mode: _mode, ...command } = recipe;
  return command;
}

export function resolve_instructions(
  user_commands: AiInlineCommand[],
): InstructionRecipe[] {
  const merged: InstructionRecipe[] = BUILTIN_INSTRUCTIONS.map((builtin) => {
    const override = user_commands.find((cmd) => cmd.id === builtin.id);
    if (!override) return builtin;
    return { ...builtin, ...override, mode: "instruction", is_builtin: true };
  });

  for (const cmd of user_commands) {
    if (!BUILTIN_INSTRUCTIONS.some((builtin) => builtin.id === cmd.id)) {
      merged.push({ ...cmd, mode: "instruction", is_builtin: false });
    }
  }

  return merged;
}
