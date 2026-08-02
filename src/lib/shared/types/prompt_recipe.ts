export type ContextSourceId =
  | "cursor_window"
  | "selection"
  | "active_document"
  | "similar_notes"
  | "backlinks"
  | "outlinks"
  | "pinned"
  | "retrieved";

export type ToolPolicy = "none" | "read_only" | "edit";

export type ApplyBehavior =
  | "replace_selection"
  | "insert_at_cursor"
  | "answer_only";

export type AssistantSurface = "inline_pm" | "inline_cm" | "panel" | "chat";

export type RecipePolicy = {
  context_sources: ContextSourceId[];
  tool_policy: ToolPolicy;
  apply_behavior: ApplyBehavior;
};

export type InstructionRecipe = {
  mode: "instruction";
  id: string;
  label: string;
  description: string;
  system_prompt: string;
  use_selection: boolean;
  is_builtin?: boolean;
  policy?: Partial<RecipePolicy>;
};

// `template` carries a "{scope}" placeholder rather than a builder function so a
// user override survives the round-trip through settings persistence.
export type QuestionRecipe = {
  mode: "question";
  id: string;
  label: string;
  template: string;
  is_builtin?: boolean;
  policy?: Partial<RecipePolicy>;
};

export type PromptRecipe = InstructionRecipe | QuestionRecipe;

export type AiInlineCommand = Omit<InstructionRecipe, "mode">;

export type AiQuestionRecipe = Omit<QuestionRecipe, "mode">;
