export type { AiInlineCommand } from "$lib/shared/types/ai_inline_command";
import type { AiInlineCommand } from "$lib/shared/types/ai_inline_command";

export const BUILTIN_INLINE_COMMANDS: AiInlineCommand[] = [
  {
    id: "continue",
    label: "Continue writing",
    description: "Extend from cursor",
    system_prompt:
      "Continue writing naturally from where the text ends. Match the tone and style. Output only the continuation text.",
    use_selection: false,
    is_builtin: true,
  },
  {
    id: "summarize",
    label: "Summarize",
    description: "Summarize the note",
    system_prompt:
      "Write a concise summary of the following text. Output only the summary.",
    use_selection: false,
    is_builtin: true,
  },
  {
    id: "expand",
    label: "Expand",
    description: "Elaborate on surrounding text",
    system_prompt:
      "Expand and elaborate on the following text. Output only the expanded text.",
    use_selection: false,
    is_builtin: true,
  },
  {
    id: "improve",
    label: "Improve writing",
    description: "Improve clarity and style",
    system_prompt:
      "Improve the clarity and style of the following text. Output only the improved text.",
    use_selection: true,
    is_builtin: true,
  },
  {
    id: "simplify",
    label: "Simplify",
    description: "Make simpler and shorter",
    system_prompt:
      "Simplify the following text. Make it shorter and clearer. Output only the simplified text.",
    use_selection: true,
    is_builtin: true,
  },
  {
    id: "fix_grammar",
    label: "Fix grammar",
    description: "Fix spelling and grammar",
    system_prompt:
      "Fix spelling and grammar errors in the following text. Output only the corrected text.",
    use_selection: true,
    is_builtin: true,
  },
  {
    id: "translate",
    label: "Translate",
    description: "Translate to another language",
    system_prompt:
      "Translate the following text to English. Output only the translation.",
    use_selection: true,
    is_builtin: true,
  },
];

export function resolve_inline_commands(
  user_commands: AiInlineCommand[],
): AiInlineCommand[] {
  const merged = BUILTIN_INLINE_COMMANDS.map((builtin) => {
    const override = user_commands.find((u) => u.id === builtin.id);
    if (!override) return builtin;
    return { ...builtin, ...override, is_builtin: true };
  });

  for (const cmd of user_commands) {
    if (!BUILTIN_INLINE_COMMANDS.some((b) => b.id === cmd.id)) {
      merged.push({ ...cmd, is_builtin: false });
    }
  }

  return merged;
}
