import type {
  AiInlineCommand,
  AiQuestionRecipe,
  AssistantSurface,
  ContextSourceId,
  InstructionRecipe,
  PromptRecipe,
  QuestionRecipe,
  RecipePolicy,
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
    template: "Summarize the key points and themes across {scope}.",
    is_builtin: true,
  },
  {
    mode: "question",
    id: "extract_action_items",
    label: "Action items",
    template:
      "List every action item, todo, and open task mentioned in {scope}, with the note each comes from.",
    is_builtin: true,
  },
  {
    mode: "question",
    id: "open_questions",
    label: "Open questions",
    template: "What open questions or unresolved threads remain in {scope}?",
    is_builtin: true,
  },
  {
    mode: "question",
    id: "timeline",
    label: "Timeline",
    template: "Build a chronological timeline of what I wrote in {scope}.",
    is_builtin: true,
  },
];

const SCOPE_PLACEHOLDER = "{scope}";

export function build_question(
  recipe: QuestionRecipe,
  scope_phrase: string,
): string {
  return recipe.template.split(SCOPE_PLACEHOLDER).join(scope_phrase);
}

const VAULT_SOURCES: ContextSourceId[] = [
  "similar_notes",
  "backlinks",
  "outlinks",
];

const INLINE_POLICY: RecipePolicy = {
  context_sources: ["cursor_window", ...VAULT_SOURCES],
  tool_policy: "none",
  apply_behavior: "replace_selection",
};

export const SURFACE_POLICY: Record<AssistantSurface, RecipePolicy> = {
  inline_pm: INLINE_POLICY,
  inline_cm: INLINE_POLICY,
  panel: {
    context_sources: ["selection", "active_document", ...VAULT_SOURCES],
    tool_policy: "none",
    apply_behavior: "replace_selection",
  },
  chat: {
    context_sources: ["pinned", "retrieved"],
    tool_policy: "none",
    apply_behavior: "answer_only",
  },
};

function is_inline(surface: AssistantSurface): boolean {
  return surface === "inline_pm" || surface === "inline_cm";
}

// Inline surfaces read either the selection or the cursor window, never both —
// `use_selection` already says which, so the default is derived from it rather
// than duplicated into a second field the two could disagree on.
function surface_defaults(
  recipe: PromptRecipe,
  surface: AssistantSurface,
): RecipePolicy {
  const base = SURFACE_POLICY[surface];
  if (!is_inline(surface)) return base;
  if (recipe.mode !== "instruction" || !recipe.use_selection) return base;
  return {
    ...base,
    context_sources: base.context_sources.map((id) =>
      id === "cursor_window" ? "selection" : id,
    ),
  };
}

// Field-level merge: a recipe that declares `context_sources` gets the same
// sources at every surface, which is what makes one recipe mean one thing.
export function resolve_policy(
  recipe: PromptRecipe,
  surface: AssistantSurface,
): RecipePolicy {
  return { ...surface_defaults(recipe, surface), ...recipe.policy };
}

export function to_inline_command(recipe: InstructionRecipe): AiInlineCommand {
  const { mode: _mode, ...command } = recipe;
  return command;
}

export function to_question_recipe(recipe: QuestionRecipe): AiQuestionRecipe {
  const { mode: _mode, ...question } = recipe;
  return question;
}

function merge_overrides<T extends PromptRecipe>(
  builtins: T[],
  overrides: (Omit<T, "mode"> & { id: string })[],
  mode: T["mode"],
): T[] {
  const merged = builtins.map((builtin) => {
    const override = overrides.find((entry) => entry.id === builtin.id);
    if (!override) return builtin;
    return { ...builtin, ...override, mode, is_builtin: true } as T;
  });

  for (const override of overrides) {
    if (builtins.some((builtin) => builtin.id === override.id)) continue;
    merged.push({ ...override, mode, is_builtin: false } as T);
  }

  return merged;
}

export function resolve_instructions(
  user_commands: AiInlineCommand[],
): InstructionRecipe[] {
  return merge_overrides(BUILTIN_INSTRUCTIONS, user_commands, "instruction");
}

export function resolve_questions(
  user_questions: AiQuestionRecipe[],
): QuestionRecipe[] {
  return merge_overrides(BUILTIN_QUESTIONS, user_questions, "question");
}
