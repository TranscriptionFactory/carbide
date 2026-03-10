import type { AiApplyTarget } from "$lib/features/ai/domain/ai_types";

export type AiContextPreview = {
  scope_label: string;
  payload_label: string;
  note_label: string;
  char_count: number;
  line_count: number;
};

function line_count(text: string) {
  if (text === "") {
    return 0;
  }

  return text.split("\n").length;
}

export function describe_ai_context_preview(input: {
  note_path: string | null;
  note_title: string | null;
  target: AiApplyTarget;
  original_text: string;
}): AiContextPreview {
  const scope_label = input.target === "selection" ? "Selection" : "Full Note";
  const note_label =
    input.note_title && input.note_path
      ? `${input.note_title} · ${input.note_path}`
      : (input.note_title ?? input.note_path ?? "Current note");

  return {
    scope_label,
    payload_label:
      input.target === "selection"
        ? "Selected text payload"
        : "Full note payload",
    note_label,
    char_count: input.original_text.length,
    line_count: line_count(input.original_text),
  };
}
