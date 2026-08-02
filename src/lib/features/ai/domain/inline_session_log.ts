import type { AssistantMessage } from "$lib/features/assistant";
import type { InstructionRecipe } from "$lib/shared/types/prompt_recipe";

const MAX_TITLE_LENGTH = 60;
const DEFAULT_COMMAND_ID = "continue";

export type InlineRequestPayload = {
  command_id?: string;
  prompt?: string;
  retry?: boolean;
};

// The user's own words, not the built prompt — that one embeds up to 4000
// characters of surrounding document and would be useless as a transcript.
export function describe_inline_request(
  payload: InlineRequestPayload | undefined,
  commands: InstructionRecipe[],
): string {
  const custom = payload?.prompt?.trim();
  if (custom) return custom;

  const command_id = payload?.command_id ?? DEFAULT_COMMAND_ID;
  const command = commands.find((recipe) => recipe.id === command_id);
  return command?.label ?? command_id;
}

export function derive_inline_title(prompt: string): string {
  const trimmed = prompt.trim().replace(/\s+/g, " ");
  if (trimmed === "") return "Inline edit";
  if (trimmed.length <= MAX_TITLE_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_TITLE_LENGTH).trimEnd()}…`;
}

export function build_inline_messages(
  prompt: string,
  result: string,
): AssistantMessage[] {
  return [
    { id: crypto.randomUUID(), role: "user", content: prompt, citations: [] },
    {
      id: crypto.randomUUID(),
      role: "assistant",
      content: result,
      citations: [],
    },
  ];
}
