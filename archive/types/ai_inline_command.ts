export type AiInlineCommand = {
  id: string;
  label: string;
  description: string;
  system_prompt: string;
  use_selection: boolean;
  is_builtin?: boolean;
};
