export type InstructionRecipe = {
  mode: "instruction";
  id: string;
  label: string;
  description: string;
  system_prompt: string;
  use_selection: boolean;
  is_builtin?: boolean;
};

export type QuestionRecipe = {
  mode: "question";
  id: string;
  label: string;
  build: (scope_phrase: string) => string;
  is_builtin?: boolean;
};

export type PromptRecipe = InstructionRecipe | QuestionRecipe;

export type AiInlineCommand = Omit<InstructionRecipe, "mode">;
